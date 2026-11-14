/**
 * AU6: what a passkey is called in the list on "How you sign in". The browser tells Gaff which
 * kind of authenticator made it (iCloud Keychain, Google Password Manager, Windows Hello), when
 * it knows; otherwise it's just "Passkey". People can rename theirs.
 */

export const PASSKEY_NAME_MAX = 60;

export function passkeyName(authenticator: string | undefined | null): string {
  const known = authenticator?.trim();
  return known ? known.slice(0, PASSKEY_NAME_MAX) : 'Passkey';
}

/** A name someone typed for their passkey, tidied; null if there's nothing left. */
export function readPasskeyName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = input.replace(/\s+/g, ' ').trim().slice(0, PASSKEY_NAME_MAX);
  return name || null;
}

/** Whether a passkey is kept in a password manager and follows the person between devices. */
export function passkeyKind(backedUp: boolean): 'synced' | 'this_device' {
  return backedUp ? 'synced' : 'this_device';
}

/** Why a passkey step in the browser didn't finish, as far as the page needs to tell apart. */
export type PasskeyTrouble =
  /** The person closed the browser's own prompt, or it timed out. The browser has said so. */
  | 'closed'
  /** This device already holds a passkey for the account. */
  | 'already_here'
  /** The sign-in was over an hour ago: confirm it's them first. */
  | 'confirm_first'
  | 'slow_down'
  | 'failed';

const closed = new Set(['ERROR_CEREMONY_ABORTED', 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY']);

/**
 * Reads the error a passkey call came back with: the browser library's code, or Gaff's own
 * refusal. Null when there was no error.
 */
export function passkeyTrouble(
  error: { code?: unknown; status?: unknown } | null | undefined,
): PasskeyTrouble | null {
  if (!error) return null;
  const code = typeof error.code === 'string' ? error.code : '';
  if (closed.has(code)) return 'closed';
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'already_here';
  if (code === 'SESSION_NOT_FRESH' || code === 'RECENT_SIGN_IN_NEEDED') return 'confirm_first';
  if (code === 'SLOW_DOWN' || error.status === 429) return 'slow_down';
  return 'failed';
}
