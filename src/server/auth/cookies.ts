import { CODE_LASTS_MINUTES } from '@/domain/auth/codes';
import { CONFIRMATION_LASTS_MINUTES } from '@/domain/auth/confirm';
import { LAST_METHOD_DAYS } from '@/domain/auth/methods';
import { HAS_PASSKEY_DAYS, NOT_NOW_DAYS } from '@/domain/auth/passkey-offer';
import { env } from '@/lib/env';

/**
 * The cookies sign-in keeps on a device, besides the session itself. None holds anything about
 * the person: a random key, a method's code, or a yes or no.
 *
 * | Cookie | Holds | Lasts |
 * | --- | --- | --- |
 * | `gaff_code_sign_in` | The random key a sign-in code is tied to, by email or by text (UX-SI-2, UX-SI-3, UX-SI-13). Also set on the way to Google or Apple, for the code that may follow (UX-SI-15) | 15 minutes |
 * | `gaff_code_confirm` | The same, for a code that confirms it's you (UX-SI-10) | 15 minutes |
 * | `gaff_confirmed` | A random grant: this browser confirmed, for one action (UX-SI-10) | 5 minutes |
 * | `gaff_last_method` | `google`, `apple`, `email_code`, `sms_code` or `passkey` (UX-SI-6) | 400 days |
 * | `gaff_passkey` | `later` after "Not now", `added` after adding a passkey (UX-SI-4) | 30 or 400 days |
 * | `gaff_passkey_device` | `1` if the device can keep a passkey. Set by the sign-in screen | 1 day |
 */
export const cookieNames = {
  signInCode: 'gaff_code_sign_in',
  confirmCode: 'gaff_code_confirm',
  confirmed: 'gaff_confirmed',
  lastMethod: 'gaff_last_method',
  passkey: 'gaff_passkey',
  passkeyDevice: 'gaff_passkey_device',
} as const;

const DAY = 24 * 60 * 60;

export const cookieLifetimes = {
  /** A little longer than the code, so an expired code is met with "That code has expired." */
  code: (CODE_LASTS_MINUTES + 5) * 60,
  confirmed: CONFIRMATION_LASTS_MINUTES * 60,
  lastMethod: LAST_METHOD_DAYS * DAY,
  passkeyLater: NOT_NOW_DAYS * DAY,
  passkeyAdded: HAS_PASSKEY_DAYS * DAY,
} as const;

/** HTTP-only, sent only to this site, and only over HTTPS wherever the site is served over it. */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env().APP_URL.startsWith('https://'),
    path: '/',
    maxAge,
  };
}
