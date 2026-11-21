'use client';

import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react';
import { ConfirmItsYou } from '@/app/(auth)/confirm/ConfirmItsYou';
import { authClient } from '@/app/(auth)/auth-client';
import { profileCopy } from '@/copy/profile';
import { codeCopy, signInCopy, staffPasskeyCopy } from '@/copy/sign-in';
import type { SignInProvider } from '@/domain/auth/methods';
import { DEFAULT_DIALLING_ISO, diallingCodes } from '@/domain/auth/mobile';
import { Button } from '@/ui/Button';
import { CodeInput } from '@/ui/CodeInput';
import { ContactField } from '@/ui/ContactField';
import { FieldError, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Sheet } from '@/ui/Sheet';
import { SummaryList } from '@/ui/SummaryList';
import { useToast } from '@/ui/Toast';
import styles from './profile.module.css';
import {
  addMobileAction,
  connectAction,
  disconnectAction,
  passkeyAddedAction,
  readyToAddPasskey,
  removeMobileAction,
  removePasskeyAction,
  renamePasskeyAction,
  sendMobileCodeAction,
  signOutDeviceAction,
  signOutOthersAction,
  type SignInAnswer,
} from './sign-in-actions';

/** What "Sign-in" and "Signed-in devices" show, already in words. Built by the page. */
export interface SignInView {
  email: string;
  /** UX-SI-13: the mobile number they sign in with, masked ("087 ••• 4567"), if they have one. */
  mobile: string | null;
  /** Whether a mobile number can be added here: only where texts are really sent. */
  canAddMobile: boolean;
  hasPasskey: boolean;
  providers: {
    provider: SignInProvider;
    name: string;
    /** "Connected on Thursday 19 November", or null if it isn't. */
    connected: string | null;
    /** Why it can't be disconnected, if it can't (Apple's Hide My Email). */
    stays: string | null;
  }[];
  passkeys: { id: string; name: string; added: string | null }[];
  devices: { id: string; words: string; when: string; current: boolean }[];
  /** Back from Google or Apple: connected, or a problem in words. */
  connected: string | null;
  problem: string | null;
  /** BA-8 (M5): one of Gaff's team, sent here to add a passkey for /internal. */
  staffNeedsPasskey: boolean;
}

const c = profileCopy.signIn;
const diallingOptions = diallingCodes.map((entry) => ({
  value: entry.iso,
  label: signInCopy.diallingCode(entry.name, entry.code),
  short: `+${entry.code}`,
}));
const noChange = () => () => {};
const d = profileCopy.devices;

/**
 * BA-8 (AU6, AU7, AU8): "How you sign in", which a person can change, and "Signed-in devices".
 * Every change to how they sign in asks "Confirm it's you" first (UX-SI-10): the server says so,
 * the sheet opens, and the change is made again once they have. Signing devices out only takes
 * access away, so it asks for nothing.
 */
export function SignInSection({ view }: { view: SignInView }) {
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(view.problem);
  const [confirming, setConfirming] = useState(false);
  const [confirmKey, setConfirmKey] = useState(0);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameProblem, setRenameProblem] = useState<string | null>(null);
  // UX-SI-13: adding a mobile number: the number, then the code texted to it.
  const [adding, setAdding] = useState<{ step: 'number' } | { step: 'code'; to: string } | null>(
    null,
  );
  const [addProblem, setAddProblem] = useState<string | null>(null);
  const [codeTry, setCodeTry] = useState(0);
  // A passkey can be added only where the browser can make one: known once the page is here.
  const canAdd = useSyncExternalStore(
    noChange,
    () => Boolean(window.PublicKeyCredential),
    () => false,
  );
  const retry = useRef<(() => void) | null>(null);

  const shownConnected = useRef(false);
  useEffect(() => {
    if (view.connected && !shownConnected.current) {
      shownConnected.current = true;
      toast.show({ message: c.toasts.connected(view.connected) });
    }
  }, [view.connected, toast]);

  const askToConfirm = (again: () => void) => {
    retry.current = again;
    setConfirmKey((key) => key + 1);
    setConfirming(true);
  };

  /** Runs a change; asks "Confirm it's you" if it needs it, then runs it again. */
  const change = (
    what: string,
    call: () => Promise<SignInAnswer>,
    after?: (answer: { done: true; message: string }) => void,
  ) => {
    setBusy(what);
    setProblem(null);
    startTransition(async () => {
      const answer = await call();
      setBusy(null);
      if ('confirm' in answer) return askToConfirm(() => change(what, call, after));
      if ('problem' in answer) {
        if (what.startsWith('rename')) setRenameProblem(answer.problem);
        else if (what.startsWith('add-mobile')) {
          setAddProblem(answer.problem);
          // A new input after each answer: a wrong code clears it.
          setCodeTry((n) => n + 1);
        } else setProblem(answer.problem);
        return;
      }
      toast.show({ message: answer.message });
      after?.(answer);
      router.refresh();
    });
  };

  /** UX-SI-13: texts the code to the number typed, once they've confirmed it's them. */
  const textTheCode = (typed: string, dialling: string) => {
    setBusy('add-mobile');
    setAddProblem(null);
    startTransition(async () => {
      const answer = await sendMobileCodeAction(typed, dialling);
      setBusy(null);
      if ('confirm' in answer) return askToConfirm(() => textTheCode(typed, dialling));
      if ('problem' in answer) return setAddProblem(answer.problem);
      setAdding({ step: 'code', to: answer.to });
    });
  };

  const addPasskey = async () => {
    setBusy('add');
    setProblem(null);
    const ready = await readyToAddPasskey();
    if ('confirm' in ready) {
      setBusy(null);
      return askToConfirm(() => void addPasskey());
    }
    const result = await authClient.passkey.addPasskey();
    setBusy(null);
    const code = (result?.error as { code?: string } | null | undefined)?.code;
    if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED')
      return setProblem(c.problems.already_here);
    if (code === 'CONFIRM_FIRST') return askToConfirm(() => void addPasskey());
    if (result?.error) return setProblem(c.problems.passkey);
    await passkeyAddedAction();
    toast.show({ message: c.toasts.passkeyAdded });
    router.refresh();
  };

  const providerRows = view.providers.map((p) => ({
    label: p.name,
    value: p.connected ?? <span className={styles.nothing}>{c.notConnected}</span>,
    action: p.connected ? (
      p.stays ? undefined : (
        <Button
          variant="quiet"
          disabled={busy !== null}
          onClick={() => change(`disconnect-${p.provider}`, () => disconnectAction(p.provider))}
        >
          {c.disconnect}
          <span className="visually-hidden"> {p.name}</span>
        </Button>
      )
    ) : (
      <Button
        variant="quiet"
        disabled={busy !== null}
        onClick={() => change(`connect-${p.provider}`, () => connectAction(p.provider))}
      >
        {c.connect}
        <span className="visually-hidden"> {p.name}</span>
      </Button>
    ),
  }));
  const stays = view.providers.find((p) => p.connected && p.stays)?.stays ?? null;

  return (
    <>
      <Section id="sign-in" title={c.title} lead={c.lead}>
        {view.staffNeedsPasskey ? (
          <Notice tone="info">
            <p>{staffPasskeyCopy.needOne}</p>
          </Notice>
        ) : null}
        <SummaryList
          rows={[
            { label: c.codeByEmail, value: c.codeTo },
            // UX-SI-13: listed once they have one. It's added by signing in with it.
            ...(view.mobile
              ? [
                  {
                    label: c.codeByText,
                    value: c.codeToMobile(view.mobile),
                    action: (
                      <Button
                        variant="quiet"
                        disabled={busy !== null}
                        onClick={() => change('remove-mobile', () => removeMobileAction())}
                      >
                        {c.remove}
                        <span className="visually-hidden"> {c.codeByTextNamed}</span>
                      </Button>
                    ),
                  },
                ]
              : view.canAddMobile
                ? [
                    {
                      label: c.codeByText,
                      value: <span className={styles.nothing}>{c.mobileNone}</span>,
                      action: (
                        <Button
                          variant="quiet"
                          disabled={busy !== null}
                          onClick={() => {
                            setAddProblem(null);
                            setAdding({ step: 'number' });
                          }}
                        >
                          {profileCopy.add}
                          <span className="visually-hidden"> {c.codeByTextNamed}</span>
                        </Button>
                      ),
                    },
                  ]
                : []),
            ...providerRows,
            ...view.passkeys.map((key) => ({
              label: key.name,
              value: key.added ?? c.passkeyNamed,
              action: (
                <span className={styles.actions}>
                  <Button
                    variant="quiet"
                    disabled={busy !== null}
                    onClick={() => {
                      setRenameProblem(null);
                      setRenaming({ id: key.id, name: key.name });
                    }}
                  >
                    {c.rename}
                    <span className="visually-hidden"> {key.name}</span>
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={busy !== null}
                    onClick={() => change(`remove-${key.id}`, () => removePasskeyAction(key.id))}
                  >
                    {c.remove}
                    <span className="visually-hidden"> {key.name}</span>
                  </Button>
                </span>
              ),
            })),
          ]}
        />
        {stays ? <p className={styles.hint}>{stays}</p> : null}
        {canAdd ? (
          <div className={styles.rowActions}>
            <Button
              variant="secondary"
              fullWidth="phone"
              disabled={busy !== null}
              onClick={() => void addPasskey()}
            >
              {busy === 'add' ? c.addingPasskey : c.addPasskey}
            </Button>
          </div>
        ) : null}
        <div role="alert">
          {problem ? <FieldError id="sign-in-problem">{problem}</FieldError> : null}
        </div>
      </Section>

      <Section id="devices" title={d.title} lead={d.lead}>
        <SummaryList
          rows={view.devices.map((device) => ({
            label: device.words,
            value: device.current ? d.thisDevice : device.when,
            action: device.current ? undefined : (
              <Button
                variant="quiet"
                disabled={busy !== null}
                onClick={() => change(`device-${device.id}`, () => signOutDeviceAction(device.id))}
              >
                {busy === `device-${device.id}` ? d.signingOut : d.signOut}
                <span className="visually-hidden"> {device.words}</span>
              </Button>
            ),
          }))}
        />
        {view.devices.length > 1 ? (
          <div className={styles.rowActions}>
            <Button
              variant="secondary"
              fullWidth="phone"
              disabled={busy !== null}
              onClick={() => change('others', () => signOutOthersAction())}
            >
              {busy === 'others' ? d.signingOut : d.signOutOthers}
            </Button>
          </div>
        ) : null}
      </Section>

      <Sheet
        open={renaming !== null && !confirming}
        onClose={() => setRenaming(null)}
        title={c.renameSheet}
        footer={
          <div className={styles.sheetButtons}>
            <Button type="submit" form="rename-passkey" variant="primary" fullWidth="phone">
              {profileCopy.save}
            </Button>
            <Button variant="quiet" fullWidth="phone" onClick={() => setRenaming(null)}>
              {profileCopy.cancel}
            </Button>
          </div>
        }
      >
        {renaming ? (
          <form
            id="rename-passkey"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get('passkeyName') ?? '');
              const key = renaming.id;
              change(
                `rename-${key}`,
                () => renamePasskeyAction(key, name),
                () => setRenaming(null),
              );
            }}
          >
            <TextField
              name="passkeyName"
              label={c.renameLabel}
              hint={c.renameHint}
              autoComplete="off"
              defaultValue={renaming.name}
              error={renameProblem ?? undefined}
            />
          </form>
        ) : null}
      </Sheet>

      <Sheet
        open={adding !== null && !confirming}
        onClose={() => setAdding(null)}
        title={c.addMobile.title}
        description={adding?.step === 'code' ? codeCopy.lead(adding.to) : c.addMobile.lead}
        footer={
          adding?.step === 'code' ? (
            <Button
              variant="quiet"
              fullWidth="phone"
              disabled={busy !== null}
              onClick={() => {
                setAddProblem(null);
                setAdding({ step: 'number' });
              }}
            >
              {c.addMobile.different}
            </Button>
          ) : (
            <div className={styles.sheetButtons}>
              <Button
                type="submit"
                form="add-mobile"
                variant="primary"
                fullWidth="phone"
                disabled={busy !== null}
              >
                {busy === 'add-mobile' ? c.addMobile.sending : c.addMobile.send}
              </Button>
              <Button variant="quiet" fullWidth="phone" onClick={() => setAdding(null)}>
                {profileCopy.cancel}
              </Button>
            </div>
          )
        }
      >
        {adding?.step === 'number' ? (
          <form
            id="add-mobile"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              textTheCode(
                String(form.get('mobileNumber') ?? ''),
                String(form.get('dialling') ?? DEFAULT_DIALLING_ISO),
              );
            }}
          >
            <ContactField
              name="mobileNumber"
              label={c.addMobile.label}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              error={addProblem ?? undefined}
              dialling={{
                name: 'dialling',
                label: signInCopy.diallingCodeLabel,
                options: diallingOptions,
                defaultValue: DEFAULT_DIALLING_ISO,
              }}
              // A number typed with its own plus carries its code; any other takes the one here.
              showDialling={(typed) => !/^\s*(\+|00)/.test(typed)}
            />
          </form>
        ) : null}
        {adding?.step === 'code' ? (
          <>
            <CodeInput
              key={codeTry}
              name="mobileCode"
              label={c.addMobile.codeLabel}
              error={addProblem ?? undefined}
              autoFocus
              onComplete={(code) =>
                change(
                  'add-mobile-code',
                  () => addMobileAction(code),
                  () => setAdding(null),
                )
              }
            />
            <p className="visually-hidden" role="status">
              {busy === 'add-mobile-code' ? c.addMobile.checking : ''}
            </p>
          </>
        ) : null}
      </Sheet>

      <ConfirmItsYou
        key={`confirm-sign-in-${confirmKey}`}
        open={confirming}
        action="change_sign_in"
        email={view.email}
        hasPasskey={view.hasPasskey}
        onClose={() => {
          setConfirming(false);
          retry.current = null;
        }}
        onConfirmed={() => {
          setConfirming(false);
          const again = retry.current;
          retry.current = null;
          again?.();
        }}
      />
    </>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`profile-${id}`} className={styles.section}>
      <h2 id={`profile-${id}`} className="type-heading">
        {title}
      </h2>
      {lead ? <p className={styles.hint}>{lead}</p> : null}
      <Stack gap={4}>{children}</Stack>
    </section>
  );
}
