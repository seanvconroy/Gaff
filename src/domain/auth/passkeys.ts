/**
 * AU6: what a passkey is called on "How you sign in". The browser tells Gaff which kind of
 * authenticator made it (iCloud Keychain, Google Password Manager, Windows Hello), when it
 * knows; otherwise it's just "Passkey". People can rename theirs.
 */

export const PASSKEY_NAME_MAX = 60;

export function passkeyName(authenticator: string | undefined | null): string {
  const known = authenticator?.replace(/\s+/g, ' ').trim();
  return known ? known.slice(0, PASSKEY_NAME_MAX) : 'Passkey';
}

/** A name someone typed for their passkey, tidied; null if there's nothing left. */
export function readPasskeyName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = input.replace(/\s+/g, ' ').trim().slice(0, PASSKEY_NAME_MAX);
  return name || null;
}

/**
 * UX-SI-4: the passkey offer comes straight after signing in, so adding one then needs nothing
 * more. Adding one later, from "How you sign in", asks "Confirm it's you" first (UX-SI-10).
 */
export const OFFER_AFTER_SIGN_IN_MINUTES = 15;

export function justSignedIn(sessionStartedAt: Date, now: Date): boolean {
  const age = now.getTime() - sessionStartedAt.getTime();
  return age >= 0 && age < OFFER_AFTER_SIGN_IN_MINUTES * 60_000;
}
