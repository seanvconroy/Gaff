'use client';

import { KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { passkeyTrouble, type PasskeyTrouble } from '@/domain/auth/passkeys';
import { authClient } from '@/lib/auth-client';
import { buttonClass } from '@/ui/Button';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { usePasskeySupport } from '@/ui/usePasskeySupport';

const HERE = '/account/security';

const words: Partial<Record<PasskeyTrouble, string>> = {
  already_here: 'This device already has a passkey for your Gaff account. It’s in the list.',
  slow_down: 'That’s a lot of tries. Wait a minute, then try again.',
  failed: 'That didn’t add a passkey. Try again, or try from another device.',
};

/**
 * AU6: "Add a passkey", shown only where the browser can make one. The browser asks for Face
 * ID, Touch ID, Windows Hello or a security key, and keeps the passkey; Gaff gets only its
 * public half. If the sign-in wasn't recent, it goes to confirm it's them first.
 */
export function AddPasskey() {
  const supported = usePasskeySupport();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<PasskeyTrouble | null>(null);

  if (supported === null) {
    return (
      <noscript>
        <p>Adding a passkey needs JavaScript. Turn it on in your browser, then come back.</p>
      </noscript>
    );
  }
  if (!supported) {
    return <p>This browser can’t make passkeys. Update it, or try another browser.</p>;
  }

  async function add() {
    setBusy(true);
    setTrouble(null);
    const result = await authClient.passkey.addPasskey().catch(() => ({ error: {} }));
    const problem = passkeyTrouble(result?.error);
    setBusy(false);
    if (!problem) {
      router.push(`${HERE}?done=passkey_added`);
    } else if (problem === 'confirm_first') {
      router.push(`/account/confirm?next=${encodeURIComponent(HERE)}`);
    } else if (problem !== 'closed') {
      setTrouble(problem);
    }
  }

  return (
    <Stack gap={3}>
      {trouble ? (
        <Notice tone="warning" role="alert">
          <p>{words[trouble]}</p>
        </Notice>
      ) : null}
      <div>
        <button
          type="button"
          className={buttonClass('secondary')}
          onClick={add}
          aria-disabled={busy}
          disabled={busy}
        >
          <KeyRound size={18} strokeWidth={1.75} aria-hidden="true" />
          {busy ? 'Waiting for your device…' : 'Add a passkey'}
        </button>
      </div>
    </Stack>
  );
}
