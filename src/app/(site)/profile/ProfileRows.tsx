'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { ConfirmItsYou } from '@/app/(auth)/confirm/ConfirmItsYou';
import { profileCopy } from '@/copy/profile';
import { savedCopy } from '@/copy/saved';
import { earningLabels } from '@/domain/applications/apply';
import { MAX_OCCUPANTS_ANSWER, stayChoices } from '@/domain/criteria/answers';
import type { KeptPart } from '@/domain/profile/kept';
import { irishToday } from '@/lib/format';
import { Button, ButtonLink } from '@/ui/Button';
import { ChoiceGroup, FieldError, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { OptionRow } from '@/ui/OptionRow';
import { DateField } from '@/ui/Pickers';
import { Sheet } from '@/ui/Sheet';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { useToast } from '@/ui/Toast';
import { useSend } from '@/ui/useSend';
import { setAlertsAction } from '../saved/actions';
import { SavedSearchList, type SearchRow } from '../saved/SavedSearches';
import {
  changeNameAction,
  changePartAction,
  deleteProfileAction,
  nameChangedAction,
  removePartAction,
  setKeepingAction,
  type SheetState,
} from './actions';
import styles from './profile.module.css';

/** What Profile shows, already in words. Built by the page from the person's own profile. */
export interface ProfileView {
  name: string | null;
  email: string;
  mobile: string | null;
  answers: {
    people: string | null;
    pets: string | null;
    moveIn: string | null;
    stay: string | null;
    /** The same, as the answers form takes them. */
    values: Record<string, string>;
  };
  income: {
    earning: string;
    amount: string;
    saidOn: string | null;
    values: Record<string, string>;
  } | null;
  keepsDetails: boolean;
  /** "What you're looking for": their saved searches, as chips, and whether they email them. */
  looking: { searches: SearchRow[]; alerts: boolean };
  /** Nothing has ever been kept. */
  nothingYet: boolean;
  signIn: { methods: string[]; passkeys: number };
  hasPasskey: boolean;
  /** They also let homes on Gaff: deleting the profile leaves their sign-in. */
  letsHomes: boolean;
  /**
   * UX-PF-9: the ID check they keep, in words, and how a redo they started went. Null: none is
   * kept, and there's no row at all (UX-PF-13).
   */
  identity: {
    value: string;
    notPassed: boolean;
    problem: string | null;
  } | null;
}

const c = profileCopy;

/**
 * Profile's rows (UX-PF-2 to UX-PF-6). Each is changed in a sheet of its own, with the same
 * controls the questions use, or removed at once. Nothing here is free text: a name and a
 * mobile number are the only things typed, and the answers are the fixed four.
 */
export function ProfileRows({ view }: { view: ProfileView }) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const remove = (part: KeptPart, what: string) => (
    <Button
      variant="quiet"
      onClick={() =>
        startTransition(async () => {
          await removePartAction(part);
          toast.show({ message: c.toasts.removed });
        })
      }
    >
      {c.remove}
      <span className="visually-hidden"> {what}</span>
    </Button>
  );
  const nothing = <span className={styles.nothing}>{c.notKept}</span>;
  const hasAnswers = Object.values(view.answers.values).some(Boolean);

  return (
    <Stack gap={8}>
      {view.nothingYet ? <p>{c.nothingYet}</p> : null}

      <Section id="details" title={c.details.title}>
        <SummaryList
          rows={[
            {
              label: c.details.name,
              value: view.name ?? <span className={styles.nothing}>{c.details.nameMissing}</span>,
              action: (
                <EditSheet
                  title={c.details.nameSheet}
                  opener={view.name ? c.change : c.add}
                  what={c.details.name.toLowerCase()}
                  action={changeNameAction}
                >
                  {(errors) => (
                    <TextField
                      name="name"
                      label={c.details.nameLabel}
                      autoComplete="name"
                      defaultValue={view.name ?? ''}
                      error={errors.name}
                    />
                  )}
                </EditSheet>
              ),
            },
            { label: c.details.email, value: view.email },
            {
              label: c.details.mobile,
              value: view.mobile ?? nothing,
              action: (
                <span className={styles.actions}>
                  <EditSheet
                    title={c.details.mobileSheet}
                    opener={view.mobile ? c.change : c.add}
                    what={c.details.mobile.toLowerCase()}
                    action={changePartAction.bind(null, 'mobile')}
                  >
                    {(errors) => (
                      <TextField
                        name="mobile"
                        label={c.details.mobileLabel}
                        hint={c.details.mobileHint}
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        width="medium"
                        defaultValue={view.mobile ?? ''}
                        error={errors.mobile}
                      />
                    )}
                  </EditSheet>
                  {view.mobile ? remove('mobile', c.details.mobile.toLowerCase()) : null}
                </span>
              ),
            },
          ]}
        />
      </Section>

      <Section id="looking" title={savedCopy.profile.title} lead={savedCopy.profile.lead}>
        {view.looking.searches.length > 0 ? (
          <>
            <SavedSearchList searches={view.looking.searches} />
            <OptionRow
              name="searchAlerts"
              label={savedCopy.profile.alertsLabel}
              hint={savedCopy.profile.alertsHint}
              defaultOn={view.looking.alerts}
              onChange={(on) =>
                startTransition(async () => {
                  await setAlertsAction(on);
                  toast.show({
                    message: on ? savedCopy.profile.alertsOn : savedCopy.profile.alertsOff,
                  });
                })
              }
            />
          </>
        ) : (
          <p className={styles.nothing}>{savedCopy.profile.none}</p>
        )}
      </Section>

      <Section id="answers" title={c.answers.title} lead={c.answers.lead}>
        <SummaryList
          rows={[
            { label: c.answers.people, value: view.answers.people ?? nothing },
            { label: c.answers.pets, value: view.answers.pets ?? nothing },
            { label: c.answers.moveIn, value: view.answers.moveIn ?? nothing },
            { label: c.answers.stay, value: view.answers.stay ?? nothing },
          ]}
        />
        <div className={styles.rowActions}>
          <EditSheet
            title={c.answers.sheet}
            description={c.answers.sheetLead}
            opener={hasAnswers ? c.change : c.add}
            what={c.answers.title.toLowerCase()}
            action={changePartAction.bind(null, 'answers')}
          >
            {(errors) => <AnswersFields values={view.answers.values} errors={errors} />}
          </EditSheet>
          {hasAnswers ? remove('answers', c.answers.title.toLowerCase()) : null}
        </div>
      </Section>

      <Section id="income" title={c.income.title} lead={c.income.lead}>
        <SummaryList
          rows={[
            { label: c.income.earning, value: view.income?.earning ?? nothing },
            {
              label: c.income.income,
              value: view.income ? (
                <>
                  {view.income.amount}
                  {view.income.saidOn ? (
                    <span className={styles.said}>{view.income.saidOn}</span>
                  ) : null}
                </>
              ) : (
                nothing
              ),
            },
          ]}
        />
        <div className={styles.rowActions}>
          <EditSheet
            title={c.income.sheet}
            opener={view.income ? c.change : c.add}
            what={c.income.title.toLowerCase()}
            action={changePartAction.bind(null, 'income')}
          >
            {(errors) => (
              <>
                <ChoiceGroup
                  name="earning"
                  legend={c.income.earning}
                  defaultValue={view.income?.values.earning}
                  error={errors.earning}
                  options={Object.entries(earningLabels).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
                <TextField
                  name="monthlyIncome"
                  label={c.income.income}
                  prefix="€"
                  width="medium"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={view.income?.values.monthlyIncome ?? ''}
                  error={errors.monthlyIncome}
                />
              </>
            )}
          </EditSheet>
          {view.income ? remove('income', c.income.title.toLowerCase()) : null}
        </div>
      </Section>

      {view.identity ? (
        <Section id="identity" title={c.identity.title} lead={c.identity.lead}>
          {view.identity.notPassed ? (
            <Notice tone="warning">
              <p>{c.identity.notPassed}</p>
            </Notice>
          ) : null}
          {view.identity.problem && c.identity.problems[view.identity.problem] ? (
            <Notice tone="warning" role="alert">
              <p>{c.identity.problems[view.identity.problem]}</p>
            </Notice>
          ) : null}
          <SummaryList rows={[{ label: c.identity.label, value: view.identity.value }]} />
          <p className={styles.hint}>{c.identity.keeps}</p>
          <form action={nameChangedAction} className={styles.rowActions}>
            <SubmitButton variant="secondary" fullWidth="phone" pendingLabel={c.identity.opening}>
              {c.identity.nameChanged}
            </SubmitButton>
          </form>
        </Section>
      ) : null}

      <Section id="keeping" title={c.keeping.title}>
        <OptionRow
          name="keepsDetails"
          label={c.keeping.label}
          hint={c.keeping.hint}
          defaultOn={view.keepsDetails}
          onChange={(on) =>
            startTransition(async () => {
              await setKeepingAction(on);
              toast.show({ message: on ? c.keeping.on : c.keeping.off });
            })
          }
        />
      </Section>

      <Section id="sign-in" title={c.signIn.title}>
        <SummaryList
          rows={[
            { label: c.signIn.methods, value: view.signIn.methods.join(', ') },
            ...(view.signIn.passkeys > 0
              ? [{ label: c.signIn.passkeysLabel, value: c.signIn.passkeys(view.signIn.passkeys) }]
              : []),
          ]}
        />
      </Section>

      <Section id="data" title={c.data.title}>
        <Stack gap={4}>
          <div>
            <p className={styles.hint}>{c.data.downloadHint}</p>
            <ButtonLink href="/profile/download" variant="secondary" fullWidth="phone">
              {c.data.download}
            </ButtonLink>
          </div>
          <DeleteProfile
            email={view.email}
            hasPasskey={view.hasPasskey}
            letsHomes={view.letsHomes}
          />
        </Stack>
      </Section>

      <p>{c.next}</p>
    </Stack>
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
      {children}
    </section>
  );
}

/**
 * A row's "Change" (or "Add"): a sheet with the row's own form. When it saves, the sheet closes
 * and a toast says so; what's wrong is said at the field.
 */
function EditSheet({
  title,
  description,
  opener,
  what,
  action,
  children,
}: {
  title: string;
  description?: string;
  opener: string;
  what: string;
  action: (state: SheetState, formData: FormData) => Promise<SheetState>;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, send] = useSend(action, c.failed);
  const saved = (state as SheetState).saved;
  const seen = useRef(saved);
  useEffect(() => {
    if (saved && saved !== seen.current) {
      seen.current = saved;
      setOpen(false);
      toast.show({ message: c.toasts.saved });
    }
  }, [saved, toast]);
  const errors = state.errors ?? {};
  return (
    <>
      <Button variant="quiet" onClick={() => setOpen(true)}>
        {opener}
        <span className="visually-hidden"> {what}</span>
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <form key={state.attempt ?? 'first'} action={send} noValidate>
          <Stack gap={6}>
            {children(errors)}
            {errors.form ? <FieldError id={`${what}-problem`}>{errors.form}</FieldError> : null}
            <div className={styles.sheetButtons}>
              <SubmitButton fullWidth="phone" pendingLabel={c.saving}>
                {c.save}
              </SubmitButton>
              <Button variant="quiet" fullWidth="phone" onClick={() => setOpen(false)}>
                {c.cancel}
              </Button>
            </div>
          </Stack>
        </form>
      </Sheet>
    </>
  );
}

/** "Your answers": the fixed four, each optional. Blank keeps nothing for that question. */
function AnswersFields({
  values,
  errors,
}: {
  values: Record<string, string>;
  errors: Record<string, string>;
}) {
  const blank = { value: '', label: c.answers.blank };
  return (
    <>
      <TextField
        name="occupants"
        label={c.answers.peopleLabel}
        width="short"
        inputMode="numeric"
        autoComplete="off"
        min={1}
        max={MAX_OCCUPANTS_ANSWER}
        defaultValue={values.occupants ?? ''}
        error={errors.occupants}
      />
      <ChoiceGroup
        name="hasPets"
        legend={c.answers.petsLabel}
        hint={c.answers.petsHint}
        defaultValue={values.hasPets ?? ''}
        options={[
          { value: 'yes', label: c.answers.yes },
          { value: 'no', label: c.answers.no },
          blank,
        ]}
      />
      <DateField
        name="moveInDate"
        label={c.answers.moveInLabel}
        title={c.answers.moveInTitle}
        min={irishToday()}
        defaultValue={values.moveInDate ?? ''}
        error={errors.moveInDate}
      />
      <ChoiceGroup
        name="stayMonths"
        legend={c.answers.stayLabel}
        defaultValue={values.stayMonths ?? ''}
        options={[
          ...stayChoices.map((choice) => ({ value: String(choice.months), label: choice.label })),
          blank,
        ]}
      />
    </>
  );
}

/**
 * UX-PF-6: "Delete my profile". One sheet says what goes and the one line that says what stays;
 * the person confirms it's them (UX-SI-10), and it is deleted at once.
 */
function DeleteProfile({
  email,
  hasPasskey,
  letsHomes,
}: {
  email: string;
  hasPasskey: boolean;
  letsHomes: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useSend(deleteProfileAction, c.failed);
  const form = useRef<HTMLFormElement>(null);
  const [closedFor, setClosedFor] = useState<number | undefined>(undefined);
  const confirming = state.confirm === 'delete_profile' && closedFor !== state.attempt;
  return (
    <div>
      <p className={styles.hint}>{c.data.deleteHint}</p>
      {/* A quiet action at rest: the destructive button is in the sheet it opens (P2, P10). */}
      <Button variant="quiet" onClick={() => setOpen(true)}>
        {c.data.delete}
      </Button>
      {/* The form sits outside the sheets, so it can send itself again once they've confirmed. */}
      <form id="delete-profile" ref={form} action={action} noValidate />
      <Sheet
        open={open && !confirming}
        onClose={() => setOpen(false)}
        title={c.deleteSheet.title}
        footer={
          <div className={styles.sheetButtons}>
            <Button type="submit" form="delete-profile" variant="destructive" fullWidth="phone">
              {c.deleteSheet.confirm}
            </Button>
            <Button variant="quiet" fullWidth="phone" onClick={() => setOpen(false)}>
              {c.cancel}
            </Button>
          </div>
        }
      >
        <Stack gap={4}>
          <p>{letsHomes ? c.deleteSheet.textKeepsSignIn : c.deleteSheet.text}</p>
          <p>{c.deleteSheet.stays}</p>
          {state.errors?.form ? (
            <FieldError id="delete-profile-problem">{state.errors.form}</FieldError>
          ) : null}
        </Stack>
      </Sheet>
      <ConfirmItsYou
        key={`confirm-${state.attempt ?? 'first'}`}
        open={confirming}
        action="delete_profile"
        email={email}
        hasPasskey={hasPasskey}
        onClose={() => {
          setClosedFor(state.attempt);
          setOpen(false);
        }}
        onConfirmed={() => {
          setClosedFor(state.attempt);
          setOpen(false);
          form.current?.requestSubmit();
        }}
      />
    </div>
  );
}
