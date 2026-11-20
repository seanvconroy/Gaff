import type { SignInMethod } from './methods';

/**
 * BA-8 (the live line's M5): Gaff's own team see across organisations on /internal, so in
 * production they open it only on a passkey sign-in, which can't be phished or guessed, from the
 * last working day. On the test copy, and locally, being on the list is enough: the founders'
 * testers are staff there.
 */

export const STAFF_SESSION_HOURS = 8;

export type StaffAccess = 'allowed' | 'needs_passkey_sign_in' | 'needs_a_passkey';

export function staffAccess(input: {
  required: boolean;
  /** How the session began, as the session itself records it. */
  method: SignInMethod | null;
  startedAt: Date;
  hasPasskey: boolean;
  now: Date;
}): StaffAccess {
  if (!input.required) return 'allowed';
  const age = input.now.getTime() - input.startedAt.getTime();
  const fresh = age >= 0 && age < STAFF_SESSION_HOURS * 60 * 60 * 1000;
  if (input.method === 'passkey' && fresh) return 'allowed';
  return input.hasPasskey ? 'needs_passkey_sign_in' : 'needs_a_passkey';
}

/** Whether staff need a passkey sign-in where Gaff is running: in production only. */
export function staffPasskeyRequired(
  gaffEnv: 'development' | 'test' | 'staging' | 'production',
): boolean {
  return gaffEnv === 'production';
}
