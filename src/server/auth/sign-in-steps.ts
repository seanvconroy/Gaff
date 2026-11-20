import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SignInMethod } from '@/domain/auth/methods';
import { funnelSubjectSchema } from '@/domain/funnels/steps';
import { env } from '@/lib/env';
import { noteFunnelStep } from '@/server/funnels/steps';
import { holdingsOf } from './member';

/**
 * UX-ME-1: the sign-in funnel (screen opened, method chosen, signed in). Nobody is known when
 * the screen opens, so what's counted is one try at signing in: a random ID made with the page
 * and carried through the method the person chooses. It isn't a cookie, nothing is kept on the
 * device, and it says nothing about who is signing in.
 *
 * The ID the browser carries is signed by the server and lasts an hour, so "screen opened" can
 * only be counted for a screen the server really rendered: a made-up ID is ignored.
 */
const ATTEMPT_LASTS_MS = 60 * 60 * 1000;

function signature(id: string, expires: number): Buffer {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`gaff:sign-in-attempt:${id}:${expires}`)
    .digest();
}

/** Signs a try's ID for the browser to carry: `id.expiry.signature`. */
export function signedSignInAttempt(id: string, now = Date.now()): string {
  const expires = now + ATTEMPT_LASTS_MS;
  return `${id}.${expires}.${signature(id, expires).toString('base64url')}`;
}

/** A new try at signing in, made when the sign-in screen is rendered. */
export function newSignInAttempt(now = Date.now()): string {
  return signedSignInAttempt(randomUUID(), now);
}

/** The ID of a try at signing in, if what came back from the browser is one the server signed. */
export function readSignInAttempt(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  const [id, expiresText, given, ...rest] = value.split('.');
  if (!id || !expiresText || !given || rest.length > 0) return null;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires < now) return null;
  const expected = signature(id, expires);
  const actual = Buffer.from(given, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return signInAttempt(id);
}

/** A try's ID, if it is one. For IDs the server already holds, such as the one kept with a code. */
export function signInAttempt(value: unknown): string | null {
  const parsed = funnelSubjectSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function noteSignInScreenOpened(attempt: unknown): Promise<void> {
  const subjectId = signInAttempt(attempt);
  if (subjectId) await noteFunnelStep({ step: 'sign_in.screen_opened', subjectId });
}

export async function noteSignInMethodChosen(
  attempt: unknown,
  method: SignInMethod,
): Promise<void> {
  const subjectId = signInAttempt(attempt);
  if (subjectId) {
    await noteFunnelStep({ step: 'sign_in.method_chosen', subjectId, variant: method });
  }
}

/**
 * The person is signed in. That ends the sign-in funnel for this try, and, for someone who
 * hasn't set up yet, starts first run (signed in, then set-up finished), counted once a person.
 */
export async function noteSignedIn(
  attempt: unknown,
  user: { id: string },
  method: SignInMethod,
): Promise<void> {
  const subjectId = signInAttempt(attempt);
  if (subjectId) await noteFunnelStep({ step: 'sign_in.signed_in', subjectId, variant: method });
  // Someone with no context yet: first run starts here (UX-AC-6).
  if ((await holdingsOf(user.id)).contexts.length === 0) {
    await noteFunnelStep({ step: 'first_run.signed_in', subjectId: user.id });
  }
}
