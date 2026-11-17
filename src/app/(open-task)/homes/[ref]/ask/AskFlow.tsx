'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { criterionSteps } from '@/app/_renter/criterion-steps';
import { askCopy as copy } from '@/copy/ask-to-view';
import { answersInWords, readAnswer, type RenterAnswers } from '@/domain/criteria/answers';
import type { Criteria } from '@/domain/criteria/criteria';
import { type AskPlan, askProblems, QUESTION_MAX } from '@/domain/enquiries/ask-to-view';
import { formValues, type FormState } from '@/lib/forms';
import { formatDate } from '@/lib/format';
import { Button, buttonProps } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { FieldError, TextArea, TextField } from '@/ui/Field';
import { focusFirstProblem } from '@/ui/flow';
import { FlowProblems, FlowShell, FlowStep, FlowTitle } from '@/ui/FlowShell';
import { Row } from '@/ui/Layout';
import { firstOpenStep, pathOf, stepAfter, stepBefore, type StepRule } from '@/ui/question-steps';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { useSend } from '@/ui/useSend';

type Values = Record<string, string>;

interface AskStep extends StepRule {
  name: string;
  title: ReactNode;
  lead?: ReactNode;
  content: (step: { values: Values; errors: Values; goTo: (id: string) => void }) => ReactNode;
}

/** The key in the browser's history state that counts the screens this flow opened. */
const OPENED = 'askSteps';

function openedHere(): number {
  const state: unknown = window.history.state;
  const opened =
    state && typeof state === 'object' ? (state as Record<string, unknown>)[OPENED] : 0;
  return typeof opened === 'number' ? opened : 0;
}

/**
 * Asking to view (section 5, "Asking to view"; UX-AV-1 to UX-AV-5), on the flow shell, one
 * question per screen: "Who should we reply to?", the home's questions, "Is this right?" where
 * anything was filled in, and "Anything to ask about the home?". Every answer is in one form,
 * sent once, by Send: nothing reaches the lister before that (UX-AV-3).
 *
 * UX-AV-2: for someone signed in whose every answer is known, the one screen is what will be
 * sent, with Send. Ask to view, then Send: two taps.
 *
 * The screen someone is on is in the address (`?q=you`), so Back and Forward work. An address
 * never holds an answer.
 */
export function AskFlow({
  action,
  providerAction,
  providers,
  attempt,
  homeHref,
  address,
  operatorName,
  criteria,
  today,
  plan,
  defaults,
  contact,
  searched,
  fromProfile,
  startAt,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  /** "Continue with Google" or "Apple": they fill the name and the email. */
  providerAction: (data: FormData) => Promise<void>;
  providers: ReadonlyArray<{ id: string; label: string }>;
  /** UX-ME-1: the sign-in try, carried to a provider. */
  attempt: string;
  homeHref: string;
  address: string;
  operatorName: string;
  criteria: Criteria;
  today: string;
  plan: AskPlan;
  defaults: Values;
  /** Who's signed in, shown on the two-tap screen. */
  contact: { fullName: string; email: string } | null;
  /** UX-AV-3: "2 people and no pets", when search carried answers in. */
  searched: string | null;
  /** UX-PF-3: answers filled in from their own profile. */
  fromProfile: boolean;
  startAt?: string | null;
}) {
  const [state, send] = useSend(action, copy.sendFailed);
  const form = useRef<HTMLFormElement>(null);
  const headings = useRef(new Map<string, HTMLHeadingElement>());
  const start = state.values ?? defaults;
  const questions = criterionSteps({
    criteria,
    moveInBy: criteria.moveInBy ? formatDate(criteria.moveInBy) : '',
    today,
    defaults: start,
  });

  const answersNow = (values: Values): RenterAnswers => {
    const answers: RenterAnswers = {};
    for (const question of plan.known) {
      const read = readAnswer(question, values, criteria);
      if (read.ok) Object.assign(answers, read.answer);
    }
    return answers;
  };

  const change = (what: string, goTo: () => void) => (
    <Button variant="quiet" onClick={goTo}>
      {copy.change}
      <span className="visually-hidden"> {what}</span>
    </Button>
  );

  const knownRows = (values: Values, goTo: (id: string) => void) =>
    answersInWords(answersNow(values), (date) => formatDate(date)).map((row) => ({
      label: row.label,
      value: row.value,
      action: change(row.label.toLowerCase(), () => goTo(questions[row.question].id)),
    }));

  const questionBox = (errors: Values) => (
    <TextArea
      name="question"
      label={copy.question.label}
      hint={copy.question.hint}
      optional
      rows={4}
      maxLength={QUESTION_MAX}
      defaultValue={start.question}
      error={errors.question}
    />
  );

  const contactFields = [
    ...(plan.askName ? (['fullName'] as const) : []),
    ...(plan.askEmail ? (['email'] as const) : []),
  ];

  const steps: AskStep[] = [];
  if (contactFields.length > 0) {
    steps.push({
      id: 'you',
      name: copy.contact.name,
      title: copy.contact.title,
      fields: contactFields,
      check: (values) => askProblems(values, contactFields),
      content: ({ errors }) => (
        <>
          {plan.askEmail ? <p>{copy.contact.lead}</p> : null}
          {plan.askName ? (
            <TextField
              name="fullName"
              label={copy.contact.fullName}
              autoComplete="name"
              autoCapitalize="words"
              defaultValue={start.fullName}
              error={errors.fullName}
            />
          ) : null}
          {plan.askEmail ? (
            <TextField
              name="email"
              type="email"
              label={copy.contact.email}
              hint={copy.contact.emailHint}
              autoComplete="email"
              inputMode="email"
              defaultValue={start.email}
              error={errors.email}
            />
          ) : null}
          {plan.askEmail && providers.length > 0 ? (
            <div>
              <p>{copy.contact.or}</p>
              <input type="hidden" name="attempt" value={attempt} />
              <Row>
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="submit"
                    name="provider"
                    value={provider.id}
                    formAction={providerAction}
                    formNoValidate
                    data-skip-checks=""
                    {...buttonProps('secondary')}
                  >
                    {provider.label}
                  </button>
                ))}
              </Row>
            </div>
          ) : null}
        </>
      ),
    });
  }
  for (const question of plan.questions) steps.push(questions[question]);

  const lead = [
    searched ? copy.check.fromSearch(searched) : null,
    fromProfile ? copy.check.fromProfile : null,
  ]
    .filter(Boolean)
    .join(' ');

  if (plan.twoTaps) {
    steps.push({
      id: 'send',
      name: copy.check.name,
      title: copy.send.title(operatorName),
      lead: lead || copy.send.lead,
      fields: ['question'],
      check: (values) => askProblems(values, ['question']),
      content: ({ values, errors, goTo }) => (
        <>
          <SummaryList
            rows={[
              {
                label: copy.send.you,
                value: (
                  <>
                    {contact?.fullName}
                    <br />
                    {contact?.email}
                  </>
                ),
              },
              ...knownRows(values, goTo),
            ]}
          />
          <Disclosure summary={copy.send.ask} open={Boolean(start.question) || undefined}>
            {questionBox(errors)}
          </Disclosure>
        </>
      ),
    });
  } else if (plan.check) {
    steps.push({
      id: 'check',
      name: copy.check.name,
      title: copy.check.title,
      lead: lead || undefined,
      fields: [],
      content: ({ values, goTo }) => <SummaryList rows={knownRows(values, goTo)} />,
    });
  }
  // Answers filled in already are off the path: a "Change" opens one, and Done comes back.
  for (const question of plan.known) steps.push({ ...questions[question], aside: true });
  if (!plan.twoTaps) {
    steps.push({
      id: 'question',
      name: copy.question.name,
      title: copy.question.title,
      fields: ['question'],
      check: (values) => askProblems(values, ['question']),
      content: ({ errors }) => questionBox(errors),
    });
  }

  const [values, setValues] = useState<Values>(start);
  const [errors, setErrors] = useState<Values>(state.errors ?? {});
  const [current, setCurrent] = useState(() => firstOpenStep(steps, start, startAt));
  const openedOn = useRef(current);
  const [moved, setMoved] = useState<'forward' | 'back' | null>(null);
  const [seen, setSeen] = useState(state.attempt);

  // The server answered: start again from what it sent back, at the first screen with a problem.
  if (state.attempt !== seen) {
    setSeen(state.attempt);
    setValues(state.values ?? start);
    setErrors(state.errors ?? {});
    const wrong = steps.find((step) => step.fields.some((field) => state.errors?.[field]));
    if (wrong) setCurrent(wrong.id);
  }

  const path = pathOf(steps, values);
  const step = steps.find((each) => each.id === current) ?? steps[0]!;
  const last = path[path.length - 1]!;
  const onPath = path.findIndex((each) => each.id === step.id);
  const isLast = step.id === last.id;
  // An answer opened from "Change" comes back to the screen that lists the answers.
  const home = steps.find((each) => each.id === 'check' || each.id === 'send') ?? last;
  const read = (): Values => (form.current ? formValues(new FormData(form.current)) : values);

  const open = (id: string, direction: 'forward' | 'back', record = true) => {
    setErrors({});
    setMoved(direction);
    setCurrent(id);
    if (record) {
      const url = new URL(window.location.href);
      url.searchParams.set('q', id);
      window.history.pushState({ [OPENED]: openedHere() + 1 }, '', url);
    }
  };

  const back = () => {
    if (openedHere() > 0) window.history.back();
    else open(step.aside ? home.id : (stepBefore(steps, read(), step.id) ?? step.id), 'back');
  };

  useEffect(() => {
    const onPop = () => {
      const asked = new URL(window.location.href).searchParams.get('q') ?? openedOn.current;
      setErrors({});
      setMoved('back');
      setCurrent(firstOpenStep(steps, read(), asked));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // `read` and `steps` are stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new screen takes focus at its question, so a screen reader hears where it is.
  useLayoutEffect(() => {
    if (moved) headings.current.get(current)?.focus();
  }, [current, moved]);

  const problemCount = Object.keys(errors).filter((field) => field !== 'form').length;

  return (
    <FlowShell
      leave={{ kind: 'close', href: homeHref, label: copy.close }}
      progress={
        path.length > 1
          ? {
              label: copy.progress,
              segments: path.map((each) => each.name),
              current: onPath === -1 ? path.findIndex((each) => each.id === home.id) : onPath,
              large: true,
            }
          : undefined
      }
      back={
        onPath > 0 || step.aside || step.id === 'question' ? (
          <Row>
            {onPath > 0 || step.aside ? (
              <Button variant="quiet" onClick={back}>
                {copy.back}
              </Button>
            ) : null}
            {step.id === 'question' ? (
              <SubmitButton variant="quiet" name="skipQuestion" value="1">
                {copy.question.skip}
              </SubmitButton>
            ) : null}
          </Row>
        ) : undefined
      }
      primary={
        isLast && !step.aside ? (
          <SubmitButton fullWidth="phone" pendingLabel={copy.sending} name="send" value="1">
            {copy.sendButton}
          </SubmitButton>
        ) : (
          <Button type="submit" variant="primary" fullWidth="phone">
            {step.aside ? copy.done : copy.next}
          </Button>
        )
      }
      form={{
        ref: form,
        action: send,
        noValidate: true,
        onChange: () => setValues(read()),
        onSubmit: (event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          // Google or Apple: off to sign in, which fills the name and the email.
          if (submitter?.hasAttribute('data-skip-checks')) return;
          const now = read();
          setValues(now);
          const skipping = submitter?.getAttribute('name') === 'skipQuestion';
          const problems = skipping ? {} : (step.check?.(now) ?? {});
          if (Object.keys(problems).length > 0) {
            event.preventDefault();
            setErrors(problems);
            focusFirstProblem(form.current);
            return;
          }
          if (step.aside) {
            event.preventDefault();
            open(home.id, 'forward');
          } else if (!isLast) {
            event.preventDefault();
            open(stepAfter(steps, now, step.id) ?? last.id, 'forward');
          }
        },
      }}
    >
      <FlowProblems count={problemCount} />
      {fromProfile ? <input type="hidden" name="offered" value="answers" /> : null}
      {steps.map((each) => (
        <FlowStep
          key={each.id}
          current={each.id === step.id}
          direction={each.id === step.id ? (moved ?? undefined) : undefined}
        >
          <FlowTitle
            title={each.title}
            lead={each.id === steps[0]!.id && !each.lead ? address : each.lead}
            ref={(node: HTMLHeadingElement | null) => {
              if (node) headings.current.set(each.id, node);
              else headings.current.delete(each.id);
            }}
          />
          {each.content({
            values,
            errors: each.id === step.id ? errors : {},
            goTo: (id) => open(id, 'forward'),
          })}
        </FlowStep>
      ))}
      {errors.form ? <FieldError id="ask-problem">{errors.form}</FieldError> : null}
    </FlowShell>
  );
}
