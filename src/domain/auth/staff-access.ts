import type { SignInMethod } from './sign-in-methods';

/**
 * M5: Gaff's own staff see across organisations, so they sign in with a passkey, which can't be
 * phished or guessed, and their session lasts a working day. Required in production; not on the
 * test copy, where the founders' testers are staff.
 */

export const STAFF_SESSION_HOURS = 8;

export type StaffAccess = 'allowed' | 'needs_passkey_sign_in' | 'needs_a_passkey';

export function staffAccess(input: {
  required: boolean;
  method: SignInMethod | null;
  startedAt: Date;
  hasPasskey: boolean;
  now: Date;
}): StaffAccess {
  if (!input.required) return 'allowed';
  const age = input.now.getTime() - input.startedAt.getTime();
  const fresh = age < STAFF_SESSION_HOURS * 60 * 60 * 1000;
  if (input.method === 'passkey' && fresh) return 'allowed';
  return input.hasPasskey ? 'needs_passkey_sign_in' : 'needs_a_passkey';
}
