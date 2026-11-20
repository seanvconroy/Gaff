'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { formValues } from '@/lib/forms';
import { Button } from './Button';
import { FieldError } from './Field';
import { focusFirstProblem } from './flow';
import { FlowProblems, FlowStep } from './FlowShell';
import styles from './QuestionSteps.module.css';
import { firstOpenStep, pathOf, stepAfter, stepBefore, type StepRule } from './question-steps';
import { SegmentedProgress } from './SegmentedProgress';
import { SubmitButton } from './SubmitButton';

type Values = Record<string, string>;

/** The key in the browser's history state that counts the screens this flow opened. */
const OPENED = 'questionSteps';

function openedHere(): number {
  const state: unknown = window.history.state;
  const opened =
    state && typeof state === 'object' ? (state as Record<string, unknown>)[OPENED] : 0;
  return typeof opened === 'number' ? opened : 0;
}

export interface QuestionStep extends StepRule {
  /** Its short name beside the progress bar: "People". */
  name: string;
  /** The question: the screen's title. */
  title: ReactNode;
  /** At most two lines under it. */
  lead?: ReactNode;
  /** The answer's controls. `goTo` opens another step, for a "Change" on a check screen. */
  content: (step: { values: Values; errors: Values; goTo: (id: string) => void }) => ReactNode;
}

/**
 * A few questions asked one per screen, inside a page (section 8, "Question steps"; UX-RN-2,
 * UX-RN-11, UX-RN-15). The page stays where it is: the progress, one question, then Back and the
 * one primary button. Every answer is in one form, sent once, by the last screen's button.
 *
 * - Each screen is checked before the next opens, and what's wrong is said at the field
 *   (UX-DS-18). Errors from the server open the screen their field is on.
 * - The screen someone is on is in the page's address (`?q=people`), so the browser's Back and
 *   Forward work, and a link opens the right screen. An address never holds an answer.
 * - A step with `aside` is off the path: it's opened from a "Change", and "Done" returns.
 *
 * The same steps and words at every width: on a phone the button spans the screen.
 */
export function QuestionSteps({
  label,
  steps,
  action,
  defaults,
  serverErrors,
  formKey,
  startAt,
  submit,
  pending,
  done = 'Done',
  formRef,
  after,
  level = 2,
}: {
  /** What the questions are, for the progress bar: "A few quick questions". */
  label: string;
  steps: readonly QuestionStep[];
  action: (formData: FormData) => void;
  /** The answers to start from: what's already known, or what was just sent back. */
  defaults: Values;
  /** Errors the server found, by field. */
  serverErrors?: Values;
  /** Changes when the server answers, so the form starts again from `defaults`. */
  formKey?: string | number;
  /** The step in the page's address when it loaded, if any. */
  startAt?: string | null;
  /** The last screen's button: "Send my answers". */
  submit: string;
  pending: string;
  /** An aside step's button. */
  done?: string;
  formRef?: RefObject<HTMLFormElement | null>;
  /** Under the buttons, on the last screen only: a quiet line or link. */
  after?: ReactNode;
  /** The questions' heading level: 3 where the page's task already has a title. */
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  const ownRef = useRef<HTMLFormElement>(null);
  const form = formRef ?? ownRef;
  const headings = useRef(new Map<string, HTMLHeadingElement>());
  const [values, setValues] = useState(defaults);
  const [errors, setErrors] = useState<Values>(serverErrors ?? {});
  const [current, setCurrent] = useState(() => firstOpenStep(steps, defaults, startAt));
  const openedOn = useRef(current);
  const [moved, setMoved] = useState<'forward' | 'back' | null>(null);
  const [seenKey, setSeenKey] = useState(formKey);

  // The server answered: start again from what it sent back, at the first screen with a problem.
  if (formKey !== seenKey) {
    setSeenKey(formKey);
    setValues(defaults);
    setErrors(serverErrors ?? {});
    const wrong = steps.find((step) => step.fields.some((field) => serverErrors?.[field]));
    if (wrong) setCurrent(wrong.id);
  }

  const path = pathOf(steps, values);
  const step = steps.find((each) => each.id === current) ?? steps[0]!;
  const last = path[path.length - 1]!;
  const onPath = path.findIndex((each) => each.id === step.id);
  const isLast = step.id === last.id;

  const read = (): Values => (form.current ? formValues(new FormData(form.current)) : values);

  const open = (id: string, direction: 'forward' | 'back', record = true) => {
    setErrors({});
    setMoved(direction);
    setCurrent(id);
    if (record) {
      const url = new URL(window.location.href);
      url.searchParams.set('q', id);
      // How many screens this flow has put into the browser's history, so "Back" can undo one.
      window.history.pushState({ [OPENED]: openedHere() + 1 }, '', url);
    }
  };

  // "Back" is the browser's Back wherever the flow itself opened this screen, so the two never
  // disagree and the history never grows by going back. A screen opened from a link has nothing
  // behind it in this flow: there, the screen before is opened.
  const back = () => {
    if (openedHere() > 0) window.history.back();
    else open(step.aside ? last.id : (stepBefore(steps, read(), step.id) ?? step.id), 'back');
  };

  // The browser's Back and Forward move between screens.
  useEffect(() => {
    const onPop = () => {
      // The page's first address may name no screen: it stands for the one the page opened on.
      const asked = new URL(window.location.href).searchParams.get('q') ?? openedOn.current;
      const target = firstOpenStep(steps, read(), asked);
      setErrors({});
      setMoved('back');
      setCurrent(target);
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

  const problemsHere = (now: Values) => step.check?.(now) ?? {};

  return (
    <form
      key={formKey ?? 'first'}
      ref={form}
      action={action}
      noValidate
      className={styles.form}
      onChange={() => setValues(read())}
      onSubmit={(event) => {
        const now = read();
        setValues(now);
        const problems = problemsHere(now);
        if (Object.keys(problems).length > 0) {
          event.preventDefault();
          setErrors(problems);
          focusFirstProblem(form.current);
          return;
        }
        if (step.aside) {
          event.preventDefault();
          open(last.id, 'forward');
        } else if (!isLast) {
          event.preventDefault();
          open(stepAfter(steps, now, step.id) ?? last.id, 'forward');
        }
      }}
    >
      <SegmentedProgress
        label={label}
        segments={path.map((each) => each.name)}
        current={onPath === -1 ? path.length - 1 : onPath}
        large
      />
      <FlowProblems count={Object.keys(errors).length} />
      {steps.map((each) => (
        <FlowStep
          key={each.id}
          current={each.id === step.id}
          direction={each.id === step.id ? (moved ?? undefined) : undefined}
        >
          <div className={styles.titles}>
            <Heading
              ref={(node: HTMLHeadingElement | null) => {
                if (node) headings.current.set(each.id, node);
                else headings.current.delete(each.id);
              }}
              tabIndex={-1}
              className={styles.title}
            >
              {each.title}
            </Heading>
            {each.lead ? <p className={styles.lead}>{each.lead}</p> : null}
          </div>
          {each.content({
            values,
            errors: each.id === step.id ? errors : {},
            goTo: (id) => open(id, 'forward'),
          })}
        </FlowStep>
      ))}
      {/* UX-DS-18: an action that failed is said at the button, and what was entered is kept. */}
      {errors.form ? <FieldError id="question-steps-problem">{errors.form}</FieldError> : null}
      <div className={styles.buttons}>
        {isLast && !step.aside ? (
          <SubmitButton fullWidth="phone" pendingLabel={pending}>
            {submit}
          </SubmitButton>
        ) : (
          <Button type="submit" variant="primary" fullWidth="phone">
            {step.aside ? done : 'Next'}
          </Button>
        )}
        {onPath > 0 || step.aside ? (
          <Button variant="quiet" fullWidth="phone" onClick={back}>
            Back
          </Button>
        ) : null}
      </div>
      {isLast && !step.aside ? after : null}
    </form>
  );
}
