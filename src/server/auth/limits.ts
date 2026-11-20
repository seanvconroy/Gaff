import { createHash } from 'node:crypto';
import type { createAuthMiddleware } from 'better-auth/api';
import { APIError } from 'better-auth/api';
import { sql } from 'drizzle-orm';
import { db, type Tx } from '@/db/client';
import {
  overLimit,
  perAddress,
  scaled,
  secondsUntilRetry,
  stepForPath,
  type Limit,
  type LimitedStep,
} from '@/domain/auth/limits';
import { env } from '@/lib/env';

/**
 * AU12: the limits on signing in, counted in Postgres so they hold across every serverless
 * instance. Better Auth has a limiter of its own, but it only sees requests that arrive over
 * HTTP, and Gaff's screens call Better Auth in-process from server actions, which skip it. So:
 *
 * - every call into Better Auth passes `limitTries`, a hook both paths go through;
 * - the steps that aren't Better Auth's (asking for a code, "Confirm it's you") call
 *   `limitFromAddress` themselves, in the server action.
 *
 * The key is a hash of what's limited and who by, so no network address is stored.
 */

/** What Better Auth hands a hook: the call's route, body, headers and what it returned. */
export type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const keyHash = (scope: string, who: string) =>
  createHash('sha256').update(`${scope}|${who}`).digest('hex');

export interface Count {
  hits: number;
  windowStartedAt: Date;
}

/**
 * Counts `by` more tries, and says how many there have been in this window and when it began.
 * One statement, so tries made at the same moment can't lose a count.
 */
export async function countTry(
  scope: string,
  who: string,
  windowSeconds: number,
  now = new Date(),
  by = 1,
): Promise<Count> {
  const at = now.toISOString();
  const stale = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const { rows } = await db().execute<{ hits: number; window_started_at: string | Date }>(sql`
    insert into auth_limits (key_hash, hits, window_started_at)
    values (${keyHash(scope, who)}, ${by}, ${at}::timestamptz)
    on conflict (key_hash) do update set
      hits = case when auth_limits.window_started_at <= ${stale}::timestamptz
        then ${by} else auth_limits.hits + ${by} end,
      window_started_at = case when auth_limits.window_started_at <= ${stale}::timestamptz
        then ${at}::timestamptz else auth_limits.window_started_at end
    returning hits, window_started_at`);
  const row = rows[0]!;
  return { hits: Number(row.hits), windowStartedAt: new Date(row.window_started_at) };
}

/** How many tries there have been in this window, without counting another. */
export async function triesSoFar(
  scope: string,
  who: string,
  windowSeconds: number,
  now = new Date(),
): Promise<number> {
  const stale = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const { rows } = await db().execute<{ hits: number }>(sql`
    select hits from auth_limits
    where key_hash = ${keyHash(scope, who)} and window_started_at > ${stale}::timestamptz`);
  return Number(rows[0]?.hits ?? 0);
}

/** The count in this window, and when it began (null if there's none), without counting. */
export async function windowOf(
  scope: string,
  who: string,
  windowSeconds: number,
  now = new Date(),
): Promise<{ hits: number; startedAt: Date | null }> {
  const stale = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const { rows } = await db().execute<{ hits: number; window_started_at: string | Date }>(sql`
    select hits, window_started_at from auth_limits
    where key_hash = ${keyHash(scope, who)} and window_started_at > ${stale}::timestamptz`);
  const row = rows[0];
  return row
    ? { hits: Number(row.hits), startedAt: new Date(row.window_started_at) }
    : { hits: 0, startedAt: null };
}

/** AU14: counters whose window began over a day ago, deleted by the nightly job. */
export async function purgeOldLimits(tx: Tx, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const deleted = await tx.execute<{ key_hash: string }>(
    sql`delete from auth_limits where window_started_at < ${cutoff}::timestamptz returning key_hash`,
  );
  return deleted.rows.length;
}

/**
 * The address a request came from: the first entry of x-forwarded-for, which Vercel sets
 * itself, so a caller can't choose it. Locally there is none.
 */
export function clientAddress(headers: Headers | undefined | null): string {
  const forwarded = headers?.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'local';
}

/** End-to-end runs sign in constantly from one address: the same code, with more room. */
export function room(limit: Limit): Limit {
  return scaled(limit, env().GAFF_ENV === 'test' ? 100 : 1);
}

/** The code a limited call is refused with, so a screen can tell it from any other answer. */
export const SLOW_DOWN = 'SLOW_DOWN';

/** A call that's over its limit: how long until it may be tried again. */
export interface Limited {
  limited: true;
  retryAfterSeconds: number;
}

/**
 * Counts one try at a step from this request's address, and says whether it's over the limit.
 * For the steps Gaff's own server actions take: asking for a code, and "Confirm it's you".
 */
export async function limitFromAddress(
  step: LimitedStep,
  headers: Headers | undefined | null,
  now = new Date(),
): Promise<Limited | null> {
  const limit = room(perAddress[step]);
  const counted = await countTry(
    `address:${step}`,
    clientAddress(headers),
    limit.windowSeconds,
    now,
  );
  if (!overLimit(counted.hits, limit)) return null;
  return {
    limited: true,
    retryAfterSeconds: secondsUntilRetry(counted.windowStartedAt, limit, now),
  };
}

/** Whether an error from Better Auth is this limiter's refusal, and when to try again. */
export function refusal(error: unknown): Limited | null {
  const body = (error as { body?: { code?: unknown; retryAfter?: unknown } } | null)?.body;
  if (body?.code !== SLOW_DOWN) return null;
  const seconds = Number(body.retryAfter);
  return {
    limited: true,
    retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 60,
  };
}

/**
 * Before any sign-in call into Better Auth: count the try, and refuse it past the limit. Coming
 * back from Google or Apple is a page load, so that one goes to the sign-in screen, which says
 * plainly when to try again.
 */
export async function limitTries(ctx: HookContext): Promise<void> {
  const step = stepForPath(ctx.path ?? '');
  if (!step) return;
  const limited = await limitFromAddress(step, ctx.headers ?? ctx.request?.headers);
  if (!limited) return;
  if (step === 'provider' && ctx.request?.method === 'GET') {
    const back = new URL('/sign-in', env().APP_URL);
    const provider = (ctx.params as { id?: unknown } | undefined)?.id;
    if (provider === 'google' || provider === 'apple') back.searchParams.set('from', provider);
    back.searchParams.set('error', 'slow_down');
    back.searchParams.set('wait', String(limited.retryAfterSeconds));
    throw ctx.redirect(back.toString());
  }
  throw new APIError('TOO_MANY_REQUESTS', {
    code: SLOW_DOWN,
    message: 'Too many tries. Wait a minute, then try again.',
    retryAfter: limited.retryAfterSeconds,
  });
}
