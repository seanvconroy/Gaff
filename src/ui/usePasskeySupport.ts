'use client';

import { useSyncExternalStore } from 'react';

const never = () => () => {};

/**
 * Whether this browser can make and use passkeys. Null on the server and until the page is
 * running in the browser (so also without JavaScript): passkey buttons appear only where
 * they'll work, and nothing claims the browser can't before it has been asked.
 */
export function usePasskeySupport(): boolean | null {
  return useSyncExternalStore(
    never,
    () => typeof window.PublicKeyCredential === 'function',
    () => null,
  );
}
