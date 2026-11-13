import { createHash } from 'node:crypto';
import { APIError } from 'better-auth/api';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  type Limit,
  overLimit,
  PASSWORD_FAILURES,
  perAddress,
  perEmail,
  scaled,
  stepForPath,
} from '@/domain/auth/limits';
import { env } from '@/lib/env';
import type { HookContext } from './hook-context';

/**
 * AU12: the limits on signing in, counted in Postgres so they hold across every function
 * instance. Better Auth has its own limiter, but it only runs for requests that come in over
 * HTTP, and Gaff's forms call Better Auth in-process from server actions, which skip it. This
 * one runs as a Better Auth hook, which both paths go through.
 *
 * The key is a hash of what's limited and who by, so no network address or email is stored.
 */
const keyHash = (scope: string, who: string) =>
  createHash('sha256').update(`${scope}|${who}`).digest('hex');

/** Counts one more try, and says how many there have been in this window. One statement. */
export async function countTry(
  scope: string,
  who: string,
  windowSeconds: number,
  now = new Date(),
): Promise<number> {
  const at = now.toISOString();
  const stale = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const { rows } = await db().execute<{ hits: number }>(sql`
    insert into auth_limits (key_hash, hits, window_started_at)
    values (${keyHash(scope, who)}, 1, ${at}::timestamptz)
    on conflict (key_hash) do update set
      hits = case when auth_limits.window_started_at <= ${stale}::timestamptz
        then 1 else auth_limits.hits + 1 end,
      window_started_at = case when auth_limits.window_started_at <= ${stale}::timestamptz
        then ${at}::timestamptz else auth_limits.window_started_at end
    returning hits`);
  return Number(rows[0]!.hits);
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

export async function forgetTries(scope: string, who: string): Promise<void> {
  await db().execute(sql`delete from auth_limits where key_hash = ${keyHash(scope, who)}`);
}

/** AU14: counters whose window began over a day ago, deleted by the nightly job. */
export async function sweepLimits(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { rowCount } = await db().execute(
    sql`delete from auth_limits where window_started_at < ${cutoff}::timestamptz`,
  );
  return rowCount ?? 0;
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
function room(limit: Limit): Limit {
  return scaled(limit, env().GAFF_ENV === 'test' ? 100 : 1);
}

export const SLOW_DOWN = 'SLOW_DOWN';
export const PASSWORD_PAUSED = 'PASSWORD_PAUSED';

const emailIn = (body: unknown): string | null => {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
};

/**
 * Before any sign-in step: count the try, and refuse it past the limit. Coming back from Google
 * or Apple is a page load, so that one is sent to the sign-in page with a plain line.
 */
export async function limitTries(ctx: HookContext): Promise<void> {
  const step = stepForPath(ctx.path ?? '');
  if (!step) return;
  const refuse = (code: string) => {
    if (step === 'provider' && ctx.request?.method === 'GET') {
      return ctx.redirect(new URL('/sign-in?error=slow_down', env().APP_URL).toString());
    }
    return new APIError('TOO_MANY_REQUESTS', {
      code,
      message: 'Too many tries. Wait a minute, then try again.',
    });
  };

  const address = clientAddress(ctx.headers ?? ctx.request?.headers);
  const addressLimit = room(perAddress[step]);
  const fromAddress = await countTry(`address:${step}`, address, addressLimit.windowSeconds);
  if (overLimit(fromAddress, addressLimit)) throw refuse(SLOW_DOWN);

  const email = emailIn(ctx.body);
  if (!email) return;
  const emailLimit = perEmail[step];
  if (emailLimit) {
    const limit = room(emailLimit);
    const forEmail = await countTry(`email:${step}`, email, limit.windowSeconds);
    if (overLimit(forEmail, limit)) throw refuse(SLOW_DOWN);
  }
  if (step === 'password') {
    const pause = room(PASSWORD_FAILURES);
    const failures = await triesSoFar('password_failures', email, pause.windowSeconds);
    if (failures >= pause.max) throw refuse(PASSWORD_PAUSED);
  }
}

/**
 * After a password sign-in: a wrong password counts towards the pause for that email, whether
 * or not the email has an account; a right one clears the count.
 */
export async function countPasswordFailures(ctx: HookContext): Promise<void> {
  if (ctx.path !== '/sign-in/email') return;
  const email = emailIn(ctx.body);
  if (!email) return;
  const returned = ctx.context.returned;
  if (returned instanceof APIError) {
    if (returned.body?.code === 'INVALID_EMAIL_OR_PASSWORD') {
      await countTry('password_failures', email, room(PASSWORD_FAILURES).windowSeconds);
    }
    return;
  }
  await forgetTries('password_failures', email);
}

/** Whether an error from Better Auth is one of this limiter's refusals. */
export function refusal(error: unknown): typeof SLOW_DOWN | typeof PASSWORD_PAUSED | null {
  const code = (error as { body?: { code?: unknown } } | null)?.body?.code;
  return code === SLOW_DOWN || code === PASSWORD_PAUSED ? code : null;
}
