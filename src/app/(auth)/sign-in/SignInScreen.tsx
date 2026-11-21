'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { signInCopy } from '@/copy/sign-in';
import type { SignInMethod, SignInProvider } from '@/domain/auth/methods';
import { DEFAULT_DIALLING_ISO, diallingCodes, needsDiallingCode } from '@/domain/auth/mobile';
import { emptyFormState, type FormState } from '@/lib/forms';
import { Button } from '@/ui/Button';
import { ContactField } from '@/ui/ContactField';
import { FieldError } from '@/ui/Field';
import { authClient, canOfferPasskeyOnField, deviceCanKeepPasskey } from '../auth-client';
import { continueWithIdentifier, continueWithProvider, signInScreenOpened } from './actions';
import { ProviderLogo } from './ProviderLogo';
import styles from './sign-in.module.css';

/**
 * UX-ME-1: counts the screen as opened once for this try at signing in. Refreshing the page, or
 * coming back to it with the back button, isn't a new opening, so it isn't counted again.
 */
function useScreenOpened(attempt: string): void {
  useEffect(() => {
    const [load] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const sameDocument = load ? new URL(load.name).pathname === window.location.pathname : false;
    if (sameDocument && load?.type !== 'navigate') return;
    void signInScreenOpened(attempt);
  }, [attempt]);
}

/**
 * UX-SI-5: a returning person with a passkey is offered it first, by the browser's own prompt on
 * the email (or mobile number) field. Choosing it signs them in; ignoring it changes nothing, and the other methods
 * stay on the screen. Also notes whether this device can keep a passkey, for the offer after
 * sign-in (UX-SI-4): a yes or no in a cookie, nothing else.
 */
function usePasskeyOnField(returnTo: string, onSignedIn: () => void): void {
  useEffect(() => {
    let gone = false;
    void deviceCanKeepPasskey().then((can) => {
      document.cookie = `gaff_passkey_device=${can ? 1 : 0}; path=/; max-age=86400; samesite=lax`;
    });
    void (async () => {
      if (!(await canOfferPasskeyOnField())) return;
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (gone || !result || result.error || !result.data) return;
      onSignedIn();
      window.location.assign(returnTo);
    })();
    return () => {
      gone = true;
    };
    // Once, when the screen opens: the browser keeps the offer on the field from then on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const diallingOptions = diallingCodes.map((entry) => ({
  value: entry.iso,
  label: signInCopy.diallingCode(entry.name, entry.code),
  short: `+${entry.code}`,
}));

/**
 * UX-SI-13, UX-SI-16: one field for an email address or a mobile number. Once what's typed is a
 * number with no country code of its own, the code sits inside the field at its start, Ireland
 * first: one box, as on any sign-in people already know.
 */
function Identifier({
  byText,
  state,
  prefilled,
}: {
  byText: boolean;
  state: FormState;
  prefilled: string | undefined;
}) {
  return (
    <ContactField
      name="identifier"
      label={byText ? signInCopy.identifierLabel : signInCopy.emailLabel}
      type={byText ? 'text' : 'email'}
      // UX-SI-5: "webauthn" lets the browser offer a saved passkey on this field.
      autoComplete="username webauthn"
      inputMode="email"
      autoCapitalize="off"
      spellCheck={false}
      defaultValue={state.values?.identifier ?? prefilled ?? ''}
      error={state.errors?.identifier}
      dialling={{
        name: 'dialling',
        label: signInCopy.diallingCodeLabel,
        options: diallingOptions,
        defaultValue: state.values?.dialling ?? DEFAULT_DIALLING_ISO,
      }}
      showDialling={(typed) => byText && needsDiallingCode(typed)}
    />
  );
}

export function SignInScreen({
  attempt,
  next,
  providers,
  byText,
  lastMethod,
  providerProblem,
  invite = null,
}: {
  attempt: string;
  next: string | null;
  providers: SignInProvider[];
  /** UX-SI-13: whether a code can go by text here, so the field takes a mobile number too. */
  byText: boolean;
  lastMethod: SignInMethod | null;
  /** Google or Apple came back with a problem that wasn't the person cancelling, in words. */
  providerProblem: { provider: SignInProvider; words: string } | null;
  /** UX-AG-11: signing in to accept an invite: "Join {agency}", with the address filled in. */
  invite?: { agencyName: string; email: string } | null;
}) {
  // The try this screen opened with stays the same for as long as the screen is up.
  const [attemptId] = useState(attempt);
  const [emailState, emailAction, emailPending] = useActionState(
    continueWithIdentifier,
    emptyFormState,
  );
  const [googleState, googleAction, googlePending] = useActionState(
    continueWithProvider,
    emptyFormState,
  );
  const [appleState, appleAction, applePending] = useActionState(
    continueWithProvider,
    emptyFormState,
  );
  const [passkeyPending, setPasskeyPending] = useState(false);
  useScreenOpened(attemptId);

  const passkeyReturn = new URLSearchParams({ method: 'passkey', attempt: attemptId });
  if (next) passkeyReturn.set('next', next);
  usePasskeyOnField(`/sign-in/return?${passkeyReturn.toString()}`, () => setPasskeyPending(true));

  // States table, "Loading": the pressed button shows progress and the others are disabled.
  const busy = emailPending || googlePending || applePending || passkeyPending;
  const provider = {
    google: { action: googleAction, pending: googlePending, error: googleState.errors?.google },
    apple: { action: appleAction, pending: applePending, error: appleState.errors?.apple },
  };
  const carried = (
    <>
      <input type="hidden" name="attempt" value={attemptId} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
    </>
  );

  return (
    <div className={styles.screen}>
      <div className={styles.title}>
        <h1 className="type-display-mobile">
          {invite ? signInCopy.joinTitle(invite.agencyName) : signInCopy.title}
        </h1>
        {lastMethod ? <p className={styles.lead}>{signInCopy.lastUsed(lastMethod)}</p> : null}
      </div>

      {/* The field first, then "or", then Google and Apple: one primary button, "Continue". */}
      <div className={styles.methods}>
        <form
          key={emailState.attempt ?? 'first'}
          action={emailAction}
          className={styles.email}
          noValidate
        >
          {carried}
          <Identifier byText={byText} state={emailState} prefilled={invite?.email} />
          <Button type="submit" variant="primary" fullWidth disabled={busy}>
            {emailPending ? signInCopy.sending : signInCopy.continue}
          </Button>
        </form>

        {providers.length > 0 ? (
          <>
            <p className={styles.divider}>{signInCopy.or}</p>
            <div className={styles.providers}>
              {providers.map((name) => {
                const error =
                  provider[name].error ??
                  (providerProblem?.provider === name ? providerProblem.words : undefined);
                return (
                  <form key={name} action={provider[name].action} className={styles.actions}>
                    <input type="hidden" name="provider" value={name} />
                    {carried}
                    <Button
                      type="submit"
                      fullWidth
                      disabled={busy}
                      aria-describedby={error ? `${name}-error` : undefined}
                    >
                      <ProviderLogo provider={name} />
                      {provider[name].pending
                        ? signInCopy.opening(name)
                        : signInCopy.continueWith(name)}
                    </Button>
                    {error ? <FieldError id={`${name}-error`}>{error}</FieldError> : null}
                  </form>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      <p className={styles.smallPrint}>
        {signInCopy.smallPrint.before}
        <Link href="/terms">{signInCopy.smallPrint.terms}</Link>
        {signInCopy.smallPrint.between}
        <Link href="/privacy">{signInCopy.smallPrint.privacy}</Link>
        {signInCopy.smallPrint.after}
      </p>
    </div>
  );
}
