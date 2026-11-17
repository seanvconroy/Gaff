import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { forwardingCopy } from '@/copy/forwarding';
import {
  forwardingHref,
  forwardingLeaveHref,
  TEST_RENTER,
  testState,
} from '@/domain/enquiries/forwarding';
import { requireMember } from '@/server/auth/member';
import { forwardingFor, testReplyFor } from '@/server/enquiries/forwarding';
import { ButtonLink } from '@/ui/Button';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { SummaryList } from '@/ui/SummaryList';
import styles from '../../forwarding.module.css';
import { type Query, screenOf } from '../../parts';
import { progress } from '../../progress';
import { RefreshWhileWaiting } from '../../RefreshWhileWaiting';

export const metadata: Metadata = { title: forwardingCopy.flow };

const copy = forwardingCopy;

/**
 * Forwarding enquiries, screen 4 of 4 (UX-LT-19): the made-up enquiry Gaff sent to the person's
 * mailbox comes back through their rule, and Gaff shows the reply a renter would get. This is
 * the product's first "it works" moment. Until the test arrives the page waits for it, looks
 * again every few seconds, and says what to do if nothing comes.
 */
export default async function TestPage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Query;
}) {
  const member = await requireMember();
  const { service, from } = await screenOf(params, searchParams);
  const status = await forwardingFor(member);
  const state = testState(status);
  const leaveHref = forwardingLeaveHref(from);
  const confirmHref = forwardingHref(from, 'confirm', service);
  if (state === 'not_sent') redirect(confirmHref);

  if (state === 'waiting') {
    return (
      <FlowShell
        leave={{ kind: 'close', href: leaveHref }}
        progress={progress(3)}
        back={
          <ButtonLink href={confirmHref} variant="quiet">
            {copy.test.sendAgain}
          </ButtonLink>
        }
        primary={
          <ButtonLink
            href={forwardingHref(from, 'test', service)}
            variant="primary"
            fullWidth="phone"
          >
            {copy.test.checkAgain}
          </ButtonLink>
        }
      >
        <FlowTitle title={copy.test.waitingTitle} lead={copy.test.waitingLead(status.testSender)} />
        <p className={styles.muted}>{copy.test.nothingYet(status.testSender)}</p>
        <RefreshWhileWaiting />
      </FlowShell>
    );
  }

  const answer = await testReplyFor(member, from.lettingId ?? null);
  return (
    <FlowShell
      leave={{ kind: 'close', href: leaveHref }}
      primary={
        <ButtonLink href={leaveHref} variant="primary" fullWidth="phone">
          {copy.test.done}
        </ButtonLink>
      }
    >
      <Outcome tone="success" title={copy.test.arrivedTitle} headingLevel={1} role="status">
        <p>{copy.test.arrivedLead}</p>
      </Outcome>
      {answer ? (
        <article className={styles.email} aria-label={copy.test.replyLabel(TEST_RENTER)}>
          <h2 className="type-heading">{copy.test.replyLabel(TEST_RENTER)}</h2>
          <SummaryList rows={[{ label: copy.test.subject, value: answer.reply.subject }]} />
          <p className={styles.emailBody}>{answer.reply.body}</p>
        </article>
      ) : (
        <p className={styles.muted}>{copy.test.noHome}</p>
      )}
    </FlowShell>
  );
}
