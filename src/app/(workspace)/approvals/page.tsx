import { Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { approveBeforeSendIsOn, listAwaitingApproval } from '@/server/answers/queries';
import { EmptyState } from '@/ui/EmptyState';
import { TextArea } from '@/ui/Field';
import { Card, PageHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { DraftedByAi } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../attention/attention.module.css';
import { approveAction, discardAction } from './actions';

export const metadata: Metadata = { title: 'Approvals' };

/** R29: check what the AI wrote before it goes. Each approval is your decision, on the record. */
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; problem?: string }>;
}) {
  const member = await requireMember();
  const [waiting, on, { done, problem }] = await Promise.all([
    listAwaitingApproval(member),
    approveBeforeSendIsOn(member),
    searchParams,
  ]);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Approvals"
        lead={
          on ? (
            'Answers the AI writes wait here for you. Fixed messages, like first replies, go straight out.'
          ) : (
            <>
              Approve-before-send is off, so AI answers go out straight away. Switch it back on in{' '}
              <Link href="/settings">Settings</Link>.
            </>
          )
        }
      />
      {done === 'sent' ? (
        <Notice tone="success" role="status">
          <p>Approved. It’s on its way.</p>
        </Notice>
      ) : null}
      {done === 'discarded' ? (
        <Notice tone="success" role="status">
          <p>Not sent. The renter’s questions are now in Questions, for you to answer.</p>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="danger" role="alert">
          <p>{problem}</p>
        </Notice>
      ) : null}
      {waiting.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nothing to approve">
          <p>When the AI drafts an answer to a renter, it waits here for you to check.</p>
        </EmptyState>
      ) : null}
      {waiting.map((draft) => (
        <Card key={draft.id} as="article" labelledBy={`draft-${draft.id}`}>
          <div className={styles.head}>
            <h2 id={`draft-${draft.id}`} className="type-title">
              {draft.renterName} asked about{' '}
              <Link href={`/lettings/${draft.lettingId}`}>{draft.address}</Link>
            </h2>
            <Row>
              <DraftedByAi />
              <span className={styles.meta}>{formatDateTime(draft.createdAt)}</span>
            </Row>
          </div>
          {draft.asked ? <blockquote className={styles.body}>{draft.asked}</blockquote> : null}
          <div className={styles.actions}>
            <form action={approveAction} className={styles.contents}>
              <input type="hidden" name="messageId" value={draft.id} />
              <div className={styles.full}>
                <TextArea
                  name="body"
                  label="The AI’s draft"
                  hint="It answers only from this home’s facts. Change anything before you send it."
                  rows={8}
                  defaultValue={draft.body}
                />
              </div>
              <SubmitButton variant="secondary" pendingLabel="Sending…">
                Approve and send
              </SubmitButton>
            </form>
            <form action={discardAction}>
              <input type="hidden" name="messageId" value={draft.id} />
              <SubmitButton variant="quiet" pendingLabel="Moving it to Questions…">
                Don’t send this
              </SubmitButton>
            </form>
          </div>
        </Card>
      ))}
    </Stack>
  );
}
