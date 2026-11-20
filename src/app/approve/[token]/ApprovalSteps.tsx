'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { approvalCopy } from '@/copy/owner';
import { approvalScreen, type ApprovalChoice, type ApprovalRole } from '@/domain/offers/approval';
import { Button } from '@/ui/Button';
import { FieldError } from '@/ui/Field';
import { FlowStep } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useSend } from '@/ui/useSend';
import styles from '../../l/landlord.module.css';
import { approvalAction } from './actions';

export interface ApprovalPerson {
  role: ApprovalRole;
  firstName: string;
  /** The screen's title, and the line under it. */
  title: string;
  lead: string;
  /** Their card: the name, what was asked, and what the checks found. */
  card: ReactNode;
}

type Answers = Partial<Record<ApprovalRole, ApprovalChoice>>;

/**
 * R19, UX-OP-6 to UX-OP-9: the owner answers for one person per screen, the chosen tenant and
 * then the backup. Each answer's two buttons sit on the card of the person it's about: approve
 * is the screen's one primary button, and declining asks for no reason (Q42).
 *
 * Both answers are sent together by the last screen's button, so the approval is recorded once,
 * as the owner's, exactly as before. The screen someone is on is in the page's address
 * (`?q=backup`), so the browser's Back works. An address never holds an answer.
 */
export function ApprovalSteps({ token, people }: { token: string; people: ApprovalPerson[] }) {
  const [state, action] = useSend(approvalAction.bind(null, token), approvalCopy.sendFailed);
  const roles = people.map((person) => person.role);
  const [answers, setAnswers] = useState<Answers>({});
  const [at, setAt] = useState(0);
  const [moved, setMoved] = useState<'forward' | 'back' | null>(null);
  const headings = useRef(new Map<ApprovalRole, HTMLHeadingElement>());
  const known = useRef(answers);
  const current = people[at] ?? people[0]!;

  useEffect(() => {
    known.current = answers;
  }, [answers]);

  // The browser's Back and Forward move between the two screens.
  useEffect(() => {
    const onPop = () => {
      const asked = new URL(window.location.href).searchParams.get('q') ?? roles[0];
      setMoved('back');
      setAt(approvalScreen(roles, known.current, asked));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // The people on the summary don't change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new screen takes focus at its title, so a screen reader hears whose it is.
  useLayoutEffect(() => {
    if (moved) headings.current.get(current.role)?.focus();
  }, [current.role, moved]);

  return (
    <form
      key={state.attempt ?? 'first'}
      action={action}
      noValidate
      className={styles.task}
      onSubmit={(event) => {
        const pressed = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const choice: ApprovalChoice = pressed?.value === 'decline' ? 'decline' : 'approve';
        if (at >= people.length - 1) return;
        // Not the last person: keep the answer and open the next person's screen.
        event.preventDefault();
        const next = people[at + 1]!;
        setAnswers({ ...answers, [current.role]: choice });
        setMoved('forward');
        setAt(at + 1);
        const url = new URL(window.location.href);
        url.searchParams.set('q', next.role);
        window.history.pushState({ approval: at + 1 }, '', url);
      }}
    >
      {/* What was answered on the screens before goes with the last screen's button. */}
      {people.slice(0, at).map((person) => (
        <input
          key={person.role}
          type="hidden"
          name={person.role}
          value={answers[person.role] ?? ''}
        />
      ))}
      {people.map((person, index) => (
        <FlowStep
          key={person.role}
          current={index === at}
          direction={index === at ? (moved ?? undefined) : undefined}
        >
          <div className={styles.task}>
            <div className={styles.titles}>
              <h2
                ref={(node) => {
                  if (node) headings.current.set(person.role, node);
                  else headings.current.delete(person.role);
                }}
                tabIndex={-1}
                className={styles.title}
              >
                {person.title}
              </h2>
              <p>{person.lead}</p>
            </div>
            <section className={styles.person} aria-labelledby={`person-${person.role}`}>
              {person.card}
              {/* UX-DS-18: an action that failed is said at the button. */}
              {index === at && state.errors?.form ? (
                <FieldError id="approval-problem">{state.errors.form}</FieldError>
              ) : null}
              {index === at ? (
                <div className={styles.actions}>
                  <SubmitButton
                    name={person.role}
                    value="approve"
                    fullWidth="phone"
                    pendingLabel={approvalCopy.sending}
                  >
                    {approvalCopy.approve(person.firstName)}
                  </SubmitButton>
                  <SubmitButton
                    name={person.role}
                    value="decline"
                    variant="secondary"
                    fullWidth="phone"
                    pendingLabel={approvalCopy.sending}
                  >
                    {approvalCopy.decline}
                  </SubmitButton>
                  {index > 0 ? (
                    <Button variant="quiet" fullWidth="phone" onClick={() => window.history.back()}>
                      {approvalCopy.back}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </FlowStep>
      ))}
    </form>
  );
}
