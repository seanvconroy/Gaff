import type { ReactNode } from 'react';
import { renterDocumentsCopy } from '@/copy/documents';
import { checksCopy, notices } from '@/copy/renter';
import type { RenterModel } from '@/server/renter/model';
import { Disclosure } from '@/ui/Disclosure';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { StepList } from '@/ui/StepList';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { startCheckAction } from './check-actions';
import { CodeGate } from './CodeGate';
import { DocumentsTask, ShareStep } from './Documents';
import { KeepIdentity, KeptNote, ReuseKeptIdentity } from './KeptIdentity';
import { ReferencesFlow } from './ReferencesFlow';
import type { HubOptions } from './RenterHub';
import { Task } from './Task';

/**
 * UX-RN-16 (UX-PP-6, notice 1): before a check starts, one line says what's kept, who sees the
 * result and when it's deleted, with "More" for the rest.
 */
function Keeps({ line, more }: { line: string; more: string }) {
  return (
    <div className={styles.keeps} data-notice="check">
      <p>{line}</p>
      <Disclosure summary={checksCopy.more}>
        <p>{more}</p>
      </Disclosure>
    </div>
  );
}

/**
 * R18, UX-RN-14 to UX-RN-18: the chosen renter's checks, one at a time. The three are a short
 * list (done, next, to come); under it is only the next one's task and button. A check that
 * didn't pass is shown in "warning", never "danger", with a plain reason and a way to a person.
 *
 * Until the one-time code is entered (or they're signed in with the same email), the page shows
 * only that there are checks, and "Start" (UX-RN-14).
 *
 * A VERIFIED IDENTITY (UX-RN-15's first row, Q35): for a signed-in renter whose enquiry this is
 * and who keeps one, the ID check is first "Use the ID check you did on 3 October?" (UX-PF-12),
 * or "Check your name" when its name isn't the application's (UX-PF-14). After a check passes
 * here, one screen asks "Keep this, so you never have to do it again?" (UX-PF-8). Nothing about
 * it appears on any page before an operator has chosen the renter (UX-PF-13).
 *
 * WORK AND INCOME (BA-16, P30 to P41): after the referees' names, the documents asked for by
 * how they earn, each read and checked at once, then one screen that shows exactly what will be
 * shared and shares it all (`?q=share`, P39). The referees are emailed then.
 */
export function ChecksTask({
  token,
  model,
  options,
}: {
  token: string;
  model: RenterModel;
  options: HubOptions;
}) {
  const { operator, checks } = model;
  const list = (
    <StepList
      label={checksCopy.list}
      steps={checks.list.map((item) => ({
        name: checksCopy.names[item.check],
        // Before the code, the list says what the checks are, not where each stands.
        state: options.open ? (item.state === 'arranged' ? 'under_way' : item.state) : 'to_come',
        stateLabel: options.open
          ? item.state === 'arranged'
            ? checksCopy.states.under_way
            : checksCopy.states[item.state]
          : checksCopy.states.to_come,
        note:
          options.open && item.state === 'arranged'
            ? checksCopy.arranged(operator)
            : options.open && item.check === 'references'
              ? refereeNotes(model)
              : undefined,
      }))}
    />
  );
  if (!options.open) {
    return (
      <Task title={checksCopy.title} lead={checksCopy.lead(operator)}>
        {list}
        <CodeGate token={token} sentTo={options.sentTo} button={checksCopy.start} />
      </Task>
    );
  }

  // UX-PF-8: the one screen after the ID check passes.
  if (options.identity?.keep) return <KeepIdentity token={token} keep={options.identity.keep} />;

  const kind = 'identity' as const;
  const provider = (): ReactNode => {
    const check = checks.items.find((item) => item.kind === kind);
    const copy = checksCopy[kind];
    const kept = options.identity?.step;
    if (kept) {
      return (
        <ReuseKeptIdentity
          token={token}
          step={kept}
          notice={
            <Keeps
              line={notices.check.identity(operator, checks.retentionDays)}
              more={checksCopy.identity.more}
            />
          }
        />
      );
    }
    const failed = check?.status === 'not_passed';
    const started = check?.status === 'in_progress';
    // P25: three tries used: a plain way to a person, in "warning", and no button.
    if (failed && check.noTriesLeft) {
      return (
        <section className={styles.task} aria-labelledby="next-check">
          <div className={styles.titles}>
            <h3 id="next-check" className="type-title">
              {checksCopy.names[kind]}
            </h3>
          </div>
          <Notice tone="warning" title={checksCopy.notPassed.title}>
            <p>
              {checksCopy.notPassed.reasons[check.reason ?? ''] ?? checksCopy.notPassed.other}{' '}
              {checksCopy.noTriesLeft(operator)}
            </p>
          </Notice>
        </section>
      );
    }
    return (
      <section className={styles.task} aria-labelledby="next-check">
        <div className={styles.titles}>
          <h3 id="next-check" className="type-title">
            {checksCopy.names[kind]}
          </h3>
          <p>{copy.what}</p>
        </div>
        {failed ? (
          <Notice tone="warning" title={checksCopy.notPassed.title}>
            <p>
              {checksCopy.notPassed.reasons[check.reason ?? ''] ?? checksCopy.notPassed.other}{' '}
              {checksCopy.notPassed.after(operator)}
            </p>
          </Notice>
        ) : null}
        {started ? <p>{checksCopy.unfinished}</p> : null}
        <Keeps line={notices.check[kind](operator, checks.retentionDays)} more={copy.more} />
        <div className={styles.actions}>
          <form action={startCheckAction.bind(null, token)}>
            <SubmitButton fullWidth="phone" pendingLabel={checksCopy.opening}>
              {failed ? checksCopy.tryAgain : started ? checksCopy.startAgain : copy.button}
            </SubmitButton>
          </form>
        </div>
      </section>
    );
  };

  return (
    <Task title={checksCopy.title}>
      {options.checkProblem && checksCopy.problems[options.checkProblem] ? (
        <Notice tone="warning" role="alert">
          <p>{checksCopy.problems[options.checkProblem]}</p>
        </Notice>
      ) : null}
      {options.idProblem && checksCopy.keptId.problems[options.idProblem] ? (
        <Notice tone="warning" role="alert">
          <p>{checksCopy.keptId.problems[options.idProblem]}</p>
        </Notice>
      ) : null}
      {options.identity?.kept ? <KeptNote kept={options.identity.kept} /> : null}
      {list}
      {checks.next === 'identity' ? provider() : null}
      {checks.next === 'income' && options.documents && options.q === 'share' ? (
        <ShareStep
          token={token}
          operator={operator}
          view={options.documents.view}
          identity={options.documents.identity}
        />
      ) : checks.next === 'income' && options.documents ? (
        <DocumentsTask
          token={token}
          operator={operator}
          view={options.documents.view}
          verified={options.documents.identity !== null}
        />
      ) : null}
      {options.documentProblem && renterDocumentsCopy.problems[options.documentProblem] ? (
        <Notice tone="warning" role="alert">
          <p>{renterDocumentsCopy.problems[options.documentProblem]}</p>
        </Notice>
      ) : null}
      {checks.next === 'references' ? (
        <div className={styles.task}>
          <ReferencesFlow token={token} ask={checks.referees} startAt={options.q} />
          <Keeps line={notices.check.references(operator)} more={checksCopy.references.more} />
        </div>
      ) : null}
      {checks.next === null ? (
        <Outcome tone="success" title={checksCopy.done.title} role="status">
          <p>{checksCopy.done.text(operator)}</p>
        </Outcome>
      ) : null}
    </Task>
  );
}

/** Each referee the renter named, and where their answer stands. Nothing about what they said. */
function refereeNotes(model: RenterModel): ReactNode {
  const named = model.checks.items.filter(
    (item) =>
      (item.kind === 'landlord_reference' || item.kind === 'employer_reference') &&
      ['in_progress', 'answered', 'no_answer'].includes(item.status),
  );
  if (named.length === 0) return undefined;
  return named
    .map((item) => {
      const who =
        item.kind === 'landlord_reference'
          ? checksCopy.referee.landlord
          : checksCopy.referee.employer;
      const what =
        item.status === 'answered'
          ? checksCopy.referee.answered
          : item.status === 'no_answer'
            ? checksCopy.referee.noAnswer
            : item.requestedOn
              ? checksCopy.referee.asked(item.requestedOn)
              : '';
      return `${who}${item.refereeName ? `, ${item.refereeName}` : ''}: ${what}`;
    })
    .join('. ');
}
