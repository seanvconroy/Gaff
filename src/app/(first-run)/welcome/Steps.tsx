'use client';

import { Building2, KeyRound, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ComponentProps, type ReactNode, useActionState, useEffect, useRef } from 'react';
import { firstRunCopy } from '@/copy/first-run';
import { SHORTEST_SEARCH } from '@/domain/register/search';
import { emptyFormState, type FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { ChoiceCards } from '@/ui/ChoiceCards';
import { TextField } from '@/ui/Field';
import { focusFirstProblem } from '@/ui/flow';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { answerName, answerPurpose, findByLicence, startApplying } from './actions';
import { welcomeHref } from './href';

const copy = firstRunCopy;

/** What every first-run screen shares: the way out, the progress, and the way back. */
export interface Frame {
  leave: ComponentProps<typeof FlowShell>['leave'];
  progress?: ComponentProps<typeof FlowShell>['progress'];
  /** The step before, if there is one. */
  backHref?: string;
  /** Carried from screen to screen. */
  next: string | null;
  named: boolean;
}

function Back({ href }: { href?: string }) {
  return href ? (
    <ButtonLink href={href} variant="quiet">
      {copy.back}
    </ButtonLink>
  ) : undefined;
}

/**
 * One question that is answered by sending a form: the flow shell, the question as its title,
 * and the errors at the field (UX-FL-3). After a failed try the form comes back with what was
 * typed, and focus goes to the field that needs another look.
 */
function Question({
  frame,
  action,
  title,
  lead,
  submit = copy.continue,
  pending = copy.saving,
  hidden,
  children,
}: {
  frame: Frame;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  title: string;
  lead?: string;
  submit?: string;
  pending?: string;
  hidden?: Record<string, string>;
  children: (state: FormState) => ReactNode;
}) {
  const [state, send] = useActionState(action, emptyFormState);
  const fields = useRef<HTMLDivElement>(null);
  const problems = Object.keys(state.errors ?? {}).length;
  useEffect(() => {
    if (problems > 0) focusFirstProblem(fields.current);
  }, [problems, state.attempt]);
  return (
    <FlowShell
      leave={frame.leave}
      progress={frame.progress}
      back={<Back href={frame.backHref} />}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={pending}>
          {submit}
        </SubmitButton>
      }
      form={{ action: send, noValidate: true }}
    >
      <FlowTitle title={title} lead={lead} />
      <FlowProblems count={problems} />
      {frame.next ? <input type="hidden" name="next" value={frame.next} /> : null}
      {frame.named ? <input type="hidden" name="named" value="1" /> : null}
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {/* The key puts back what was typed after a failed try. */}
      <div key={state.attempt ?? 'first'} ref={fields}>
        {children(state)}
      </div>
    </FlowShell>
  );
}

/** Step 1: "What's your name?" Skipped when sign-in supplied it. */
export function NameStep({
  frame,
  defaultName,
  then,
}: {
  frame: Frame;
  defaultName: string;
  /** The screen to go on to, when it isn't the next question. */
  then?: 'agency';
}) {
  return (
    <Question
      frame={frame}
      action={answerName}
      title={copy.name.title}
      hidden={then ? { then } : undefined}
    >
      {(state) => (
        <TextField
          name="name"
          label={copy.name.label}
          autoComplete="name"
          autoCapitalize="words"
          defaultValue={state.values?.name ?? defaultName}
          error={state.errors?.name}
        />
      )}
    </Question>
  );
}

/** Step 2: "What brings you to Gaff?" Three large choices. None of them fixes anything. */
export function PurposeStep({ frame, title }: { frame: Frame; title: string }) {
  return (
    <Question frame={frame} action={answerPurpose} title={title}>
      {(state) => (
        <ChoiceCards
          name="purpose"
          legend={copy.purpose.legend}
          hideLegend
          defaultValue={state.values?.purpose}
          error={state.errors?.purpose}
          options={[
            { value: 'renting', label: copy.purpose.options.renting, icon: Search },
            { value: 'own_home', label: copy.purpose.options.own_home, icon: KeyRound },
            { value: 'agency', label: copy.purpose.options.agency, icon: Building2 },
          ]}
        />
      )}
    </Question>
  );
}

/** UX-AG-2: "Enter the licence number instead": the same question, answered another way. */
export function LicenceStep({ frame }: { frame: Frame }) {
  return (
    <Question frame={frame} action={findByLicence} title={copy.licence.title}>
      {(state) => (
        <TextField
          name="licence"
          label={copy.licence.label}
          hint={copy.licence.hint}
          width="medium"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={state.values?.licence}
          error={state.errors?.licence}
        />
      )}
    </Question>
  );
}

/** UX-AG-2: "We're applying for a licence": the agency's name, and everything can be set up. */
export function ApplyingStep({ frame }: { frame: Frame }) {
  return (
    <Question
      frame={frame}
      action={startApplying}
      title={copy.applying.title}
      lead={copy.applying.lead}
      submit={copy.applying.submit}
    >
      {(state) => (
        <TextField
          name="agencyName"
          label={copy.applying.label}
          hint={copy.applying.hint}
          autoComplete="organization"
          defaultValue={state.values?.agencyName}
          error={state.errors?.agencyName}
        />
      )}
    </Question>
  );
}

/**
 * UX-AG-1: the search field of "Which agency?". Results come from the server as the address
 * changes, so the list fills in as the person types; pressing Search does the same with no
 * script. Nothing is searched for until there are two letters.
 */
export function AgencySearchField({
  typed,
  next,
  named,
}: {
  typed: string;
  next: string | null;
  named: boolean;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <TextField
      name="q"
      type="search"
      label={copy.agency.label}
      autoComplete="organization"
      enterKeyHint="search"
      defaultValue={typed}
      onChange={(event) => {
        const q = event.currentTarget.value.trim();
        clearTimeout(timer.current);
        if (q.length > 0 && q.length < SHORTEST_SEARCH) return;
        timer.current = setTimeout(() => {
          router.replace(welcomeHref({ step: 'agency', q, next, named }), { scroll: false });
        }, 250);
      }}
    />
  );
}
