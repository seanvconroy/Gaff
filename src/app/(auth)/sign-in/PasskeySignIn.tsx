'use client';

import { KeyRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { passkeyTrouble, type PasskeyTrouble } from '@/domain/auth/passkeys';
import { authClient } from '@/lib/auth-client';
import { buttonClass } from '@/ui/Button';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { TextDivider } from '@/ui/TextDivider';
import { usePasskeySupport } from '@/ui/usePasskeySupport';

const words: Partial<Record<PasskeyTrouble, string>> = {
  slow_down: 'That’s a lot of tries. Wait a minute, then try again.',
  failed:
    'That passkey didn’t sign you in. It may have been removed from your account. Try again, or sign in another way.',
};

/**
 * AU6: "Sign in with a passkey", shown only where the browser can do it. One touch, no email:
 * the passkey says whose account it is. With `autofill`, and where the browser supports it,
 * passkeys are also offered in the email box's own suggestions as the page loads.
 */
function PasskeyButton({
  next,
  autofill,
  variant = 'secondary',
}: {
  next: string;
  autofill: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<PasskeyTrouble | null>(null);

  useEffect(() => {
    if (!autofill) return;
    let left = false;
    void (async () => {
      const offered = await window.PublicKeyCredential?.isConditionalMediationAvailable?.();
      if (!offered || left) return;
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (!left && !passkeyTrouble(result?.error)) window.location.assign(next);
    })().catch(() => {});
    return () => {
      left = true;
    };
  }, [next, autofill]);

  async function signIn() {
    setBusy(true);
    setTrouble(null);
    const result = await authClient.signIn.passkey().catch(() => ({ error: {} }));
    const problem = passkeyTrouble(result?.error);
    if (!problem) {
      // A full page load, so every part of the page knows who's signed in.
      window.location.assign(next);
      return;
    }
    setBusy(false);
    // Closing the browser's own prompt needs no more said about it.
    setTrouble(problem === 'closed' ? null : problem);
  }

  return (
    <>
      {trouble ? (
        <Notice tone="warning" role="alert">
          <p>{words[trouble] ?? words.failed}</p>
        </Notice>
      ) : null}
      <button
        type="button"
        className={buttonClass(variant, true)}
        onClick={signIn}
        aria-disabled={busy}
        disabled={busy}
      >
        <KeyRound size={18} strokeWidth={1.75} aria-hidden="true" />
        {busy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
      </button>
    </>
  );
}

/**
 * The quick ways in, above the email form: Google and Apple (passed in, rendered on the
 * server) and a passkey. With none of them, nothing shows, and the divider goes too.
 */
export function QuickWays({
  hasProviders,
  passkeys,
  passkeyAutofill,
  next,
  children,
}: {
  hasProviders: boolean;
  passkeys: boolean;
  passkeyAutofill: boolean;
  next: string;
  children: ReactNode;
}) {
  const canUsePasskeys = usePasskeySupport() === true && passkeys;
  if (!hasProviders && !canUsePasskeys) return null;
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        {children}
        {canUsePasskeys ? <PasskeyButton next={next} autofill={passkeyAutofill} /> : null}
      </Stack>
      <TextDivider>or use your email</TextDivider>
    </Stack>
  );
}

/**
 * M5: a passkey as the only way on, for Gaff's own tools. Where the browser can't use one, it
 * says where to go instead.
 */
export function PasskeyAlone({ next }: { next: string }) {
  const supported = usePasskeySupport();
  if (supported === null) {
    return (
      <noscript>
        <p>
          Signing in with a passkey needs JavaScript. Turn it on in your browser, then come back.
        </p>
      </noscript>
    );
  }
  if (!supported) {
    return (
      <p>
        This browser can’t use passkeys. Open Gaff in the browser, or on the device, that holds
        yours.
      </p>
    );
  }
  return (
    <Stack gap={3}>
      <PasskeyButton next={next} autofill={false} variant="primary" />
    </Stack>
  );
}
