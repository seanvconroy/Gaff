/**
 * AU7: changing how you sign in (a password, Google, Apple, a passkey) needs a sign-in in the
 * last hour. Someone who finds an unlocked laptop can use what's open, but can't add their own
 * way in without proving it's them.
 */

export const RECENT_SIGN_IN_SECONDS = 60 * 60;

export function signedInRecently(sessionStartedAt: Date, now: Date): boolean {
  return now.getTime() - sessionStartedAt.getTime() < RECENT_SIGN_IN_SECONDS * 1000;
}
