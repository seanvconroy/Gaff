import type { SignInMethod } from './methods';

/** UX-SI-4: "Not now" is remembered on the device for this long. */
export const NOT_NOW_DAYS = 30;
/** A device that has a passkey isn't asked again. */
export const HAS_PASSKEY_DAYS = 400;

/** What the device remembers about the offer: `later` after "Not now", `added` after adding one. */
export type PasskeyMemory = 'later' | 'added';

export function passkeyMemoryFrom(value: unknown): PasskeyMemory | null {
  return value === 'later' || value === 'added' ? value : null;
}

/**
 * UX-SI-4: whether to offer a passkey after this sign-in. Once, after signing in another way, on
 * a device that can keep one, unless it already has one or the person said "Not now" in the last
 * 30 days (the device forgets "Not now" by itself after that).
 */
export function shouldOfferPasskey(input: {
  method: SignInMethod | null;
  deviceCan: boolean;
  remembered: PasskeyMemory | null;
}): boolean {
  if (!input.method || input.method === 'passkey') return false;
  return input.deviceCan && input.remembered === null;
}

/** The kinds of device whose own way of unlocking has a name people know. */
export type DeviceKind = 'apple' | 'android' | 'windows' | 'other';

/** UX-SI-4: the device, from what the browser says it is, so the sheet can use its own words. */
export function deviceKind(userAgent: string): DeviceKind {
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent)) return 'apple';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Windows/i.test(userAgent)) return 'windows';
  return 'other';
}
