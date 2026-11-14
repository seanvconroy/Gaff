import { describe, expect, it } from 'vitest';
import {
  passkeyKind,
  passkeyName,
  PASSKEY_NAME_MAX,
  passkeyTrouble,
  readPasskeyName,
} from './passkeys';

describe('AU6: naming passkeys', () => {
  it('names a passkey after what made it, when the browser says', () => {
    expect(passkeyName('iCloud Keychain')).toBe('iCloud Keychain');
    expect(passkeyName('  Windows Hello ')).toBe('Windows Hello');
  });

  it('calls it a passkey otherwise', () => {
    expect(passkeyName(undefined)).toBe('Passkey');
    expect(passkeyName('')).toBe('Passkey');
    expect(passkeyName(null)).toBe('Passkey');
  });

  it('tidies a name someone types, and keeps it short', () => {
    expect(readPasskeyName('  My   work laptop ')).toBe('My work laptop');
    expect(readPasskeyName('x'.repeat(200))).toHaveLength(PASSKEY_NAME_MAX);
    expect(readPasskeyName('   ')).toBeNull();
    expect(readPasskeyName(undefined)).toBeNull();
  });

  it('says whether a passkey follows the person between devices', () => {
    expect(passkeyKind(true)).toBe('synced');
    expect(passkeyKind(false)).toBe('this_device');
  });
});

describe('AU6: when a passkey step doesn’t finish', () => {
  it('is no trouble when there was no error', () => {
    expect(passkeyTrouble(null)).toBeNull();
    expect(passkeyTrouble(undefined)).toBeNull();
  });

  it('says nothing more when the person closed the browser’s own prompt', () => {
    expect(passkeyTrouble({ code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', status: 400 })).toBe(
      'closed',
    );
    expect(passkeyTrouble({ code: 'ERROR_CEREMONY_ABORTED' })).toBe('closed');
  });

  it('knows a device that already has a passkey for the account', () => {
    expect(passkeyTrouble({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' })).toBe(
      'already_here',
    );
  });

  it('sends an old sign-in to confirm it’s them', () => {
    expect(passkeyTrouble({ code: 'SESSION_NOT_FRESH', status: 403 })).toBe('confirm_first');
    expect(passkeyTrouble({ code: 'RECENT_SIGN_IN_NEEDED', status: 403 })).toBe('confirm_first');
  });

  it('knows too many tries', () => {
    expect(passkeyTrouble({ code: 'SLOW_DOWN', status: 429 })).toBe('slow_down');
    expect(passkeyTrouble({ status: 429 })).toBe('slow_down');
  });

  it('treats anything else as a failure, including an error with no code', () => {
    expect(passkeyTrouble({})).toBe('failed');
    expect(passkeyTrouble({ code: 'PASSKEY_NOT_FOUND', status: 401 })).toBe('failed');
    expect(passkeyTrouble({ code: 'AUTH_CANCELLED', status: 400 })).toBe('failed');
    expect(passkeyTrouble({ code: 42 })).toBe('failed');
  });
});
