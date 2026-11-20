'use client';

import { addLettingCopy } from '@/copy/add-letting';
import type { PersonCheckState } from '@/server/identity/person-checks';
import { ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from './flow.module.css';
import { progressOf, type StepFrame } from './StepForm';

const copy = addLettingCopy;
const c = copy.goLive.identity;

/**
 * UX-TS-1, UX-TS-2 (Q47): a private landlord's one check before their first home goes live:
 * "Confirm it's you". It is the go-live step while `goLiveGate` says `identity_needed`, so it is
 * never asked earlier, and once it has passed it's never asked again. One primary button, which
 * opens the ID service; the person comes back to the go-live step, which is then the usual one.
 *
 * Before it starts, one line says what's kept (UX-RN-16's rule), with "More" for the rest.
 */
export function GoLiveIdentity({
  frame,
  action,
  last,
  problem,
}: {
  frame: StepFrame;
  action: () => Promise<void>;
  /** Their last check of their own, if it didn't finish or didn't pass. */
  last: PersonCheckState | null;
  /** A code for something that just went wrong, said once. */
  problem?: string;
}) {
  const failed = last?.status === 'not_passed';
  return (
    <FlowShell
      leave={{ kind: 'close', href: frame.leaveHref }}
      progress={progressOf(frame)}
      back={
        frame.backHref ? (
          <ButtonLink href={frame.backHref} variant="quiet">
            {copy.back}
          </ButtonLink>
        ) : undefined
      }
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={c.opening}>
          {c.button}
        </SubmitButton>
      }
      form={{ action }}
    >
      <FlowTitle title={c.title} lead={c.lead} />
      {problem && c.problems[problem] ? (
        <Notice tone="warning" role="alert">
          <p>{c.problems[problem]}</p>
        </Notice>
      ) : null}
      {failed ? (
        <Notice tone="warning" title={c.notPassed}>
          <p>
            {c.reasons[last.reason ?? ''] ?? c.reasons.gave_up}{' '}
            {last.noTriesLeft ? c.noTriesLeft : c.tryAgain}
          </p>
        </Notice>
      ) : null}
      {last?.status === 'in_progress' ? <p>{c.unfinished}</p> : null}
      <div className={styles.block}>
        <p>{c.what}</p>
        <p className={styles.muted} data-notice="check">
          {c.keeps}
        </p>
        <Disclosure summary={c.moreLabel}>
          <p>{c.more}</p>
        </Disclosure>
      </div>
      <p>{c.next}</p>
    </FlowShell>
  );
}
