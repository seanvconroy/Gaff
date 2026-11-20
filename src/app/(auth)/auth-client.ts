'use client';

import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';

/**
 * Better Auth in the browser, for the one thing only a browser can do: talk to the device's
 * passkeys (UX-SI-4, UX-SI-5, UX-SI-10). Everything else in sign-in goes through server actions.
 */
export const authClient = createAuthClient({ plugins: [passkeyClient()] });

/** Whether this browser can offer a saved passkey on the email field (UX-SI-5). */
export async function canOfferPasskeyOnField(): Promise<boolean> {
  try {
    return Boolean(await window.PublicKeyCredential?.isConditionalMediationAvailable?.());
  } catch {
    return false;
  }
}

/** Whether this device can keep a passkey of its own: Face ID, a fingerprint, Windows Hello. */
export async function deviceCanKeepPasskey(): Promise<boolean> {
  try {
    return Boolean(
      await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.(),
    );
  } catch {
    return false;
  }
}
