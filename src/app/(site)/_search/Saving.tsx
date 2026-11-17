'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { savedCopy } from '@/copy/saved';
import { Button } from '@/ui/Button';
import { FieldError, TextField } from '@/ui/Field';
import { HeartButton } from '@/ui/HeartButton';
import { Stack } from '@/ui/Layout';
import { Sheet } from '@/ui/Sheet';
import { SubmitButton } from '@/ui/SubmitButton';
import { useToast } from '@/ui/Toast';
import { useSend } from '@/ui/useSend';
import {
  type EmailSaveState,
  saveSearchAction,
  saveSearchByEmailAction,
  setHomeSavedAction,
} from './save-actions';
import styles from './search.module.css';

const c = savedCopy;

/**
 * Where the heart goes for someone signed out: sign in, the light way (Google, Apple or a code),
 * then the home is saved and they're back where they were (section 2, "What a person needs, and
 * when": saving a home asks for a sign-in at the moment they ask for it).
 */
export function saveHomeSignInHref(ref: string, back: string): string {
  const save = `/saved/save?${new URLSearchParams({ home: ref, back })}`;
  return `/sign-in?${new URLSearchParams({ next: save })}`;
}

/**
 * The heart (UX-SR-6; Save on a home's page): saves the home or takes it off Saved. Signed in,
 * it changes at once and says so; signed out, it asks for a sign-in first.
 */
export function SaveHome({
  homeRef,
  label,
  saved: savedAtFirst,
  signedIn,
  back,
}: {
  homeRef: string;
  label: string;
  saved: boolean;
  signedIn: boolean;
  /** Where to come back to after signing in: this page. */
  back: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [saved, setSaved] = useState(savedAtFirst);
  const [, startTransition] = useTransition();
  return (
    <HeartButton
      label={label}
      saved={saved}
      onPress={() => {
        if (!signedIn) {
          router.push(saveHomeSignInHref(homeRef, back));
          return;
        }
        const want = !saved;
        setSaved(want);
        startTransition(async () => {
          try {
            const now = await setHomeSavedAction(homeRef, want);
            setSaved(now);
            toast.show({
              message: now === want ? (now ? c.heart.saved : c.heart.removed) : c.heart.failed,
            });
          } catch {
            setSaved(!want);
            toast.show({ message: c.heart.failed });
          }
        });
      }}
    />
  );
}

/**
 * UX-SR-9, UX-SR-10: "Tell me when one comes up". Signed in, the search is kept on their profile
 * at once. Signed out, a sheet asks for an email address, and nothing more; one email then asks
 * them to confirm it.
 */
export function TellMeWhen({
  query,
  primary,
  signedIn,
  kept,
  label = c.alert.action,
}: {
  /** The search's address query: its chips' values, and nothing else. */
  query: string;
  primary: boolean;
  signedIn: boolean;
  /** They already keep this search. */
  kept: boolean;
  label?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // Each opening is a new sheet: it asks again, rather than showing the last send.
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(kept);
  const [pending, startTransition] = useTransition();
  const variant = primary ? 'primary' : 'secondary';

  if (done) {
    return <p className={styles.kept}>{c.alert.kept}</p>;
  }
  if (signedIn) {
    return (
      <Button
        variant={variant}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const outcome = await saveSearchAction(query);
              if (outcome === 'saved' || outcome === 'already') setDone(true);
              toast.show({
                message:
                  outcome === 'saved'
                    ? c.alert.saved
                    : outcome === 'already'
                      ? c.alert.already
                      : outcome === 'too_many'
                        ? c.alert.tooManySaved
                        : c.alert.failed,
              });
            } catch {
              toast.show({ message: c.alert.failed });
            }
          })
        }
      >
        {label}
      </Button>
    );
  }
  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          setRound((n) => n + 1);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <EmailSheet key={round} query={query} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function EmailSheet({
  query,
  open,
  onClose,
}: {
  query: string;
  open: boolean;
  onClose: () => void;
}) {
  const [state, send] = useSend(saveSearchByEmailAction.bind(null, query), c.alert.failed, 'email');
  const sent = (state as EmailSaveState).sentTo;
  const errors = state.errors ?? {};

  if (sent !== undefined) {
    return (
      <Sheet open={open} onClose={onClose} title={c.alert.checkTitle}>
        <Stack gap={6}>
          <p role="status">{c.alert.check(sent)}</p>
          <div className={styles.sheetButtons}>
            <Button variant="primary" fullWidth="phone" onClick={onClose}>
              {c.alert.done}
            </Button>
          </div>
        </Stack>
      </Sheet>
    );
  }
  return (
    <Sheet open={open} onClose={onClose} title={c.alert.sheetTitle} description={c.alert.sheetLead}>
      <form key={state.attempt ?? 'first'} action={send} noValidate>
        <Stack gap={6}>
          <TextField
            name="email"
            label={c.alert.emailLabel}
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={state.values?.email ?? ''}
            error={errors.email}
          />
          {errors.form ? <FieldError id="save-search-problem">{errors.form}</FieldError> : null}
          <div className={styles.sheetButtons}>
            <SubmitButton fullWidth="phone" pendingLabel={c.alert.saving}>
              {c.alert.save}
            </SubmitButton>
            <Button variant="quiet" fullWidth="phone" onClick={onClose}>
              {c.alert.cancel}
            </Button>
          </div>
        </Stack>
      </form>
    </Sheet>
  );
}
