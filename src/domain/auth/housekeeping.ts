/**
 * AU14 (rule 9): how long sign-in's leftovers are kept before the nightly job deletes them.
 * Sessions, codes and invitations go once they've run out. A sign-up nobody confirmed holds an
 * email address and a password that nobody has proved are theirs, so it goes after a week.
 */

export const PENDING_SIGN_UP_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sign-ups begun before this instant, and still unconfirmed, are deleted. */
export function pendingSignUpCutoff(now: Date): Date {
  return new Date(now.getTime() - PENDING_SIGN_UP_DAYS * DAY_MS);
}
