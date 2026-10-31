import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { approveBeforeSendIsOn, listAwaitingApproval } from '@/server/answers/queries';
import { TextArea } from '@/ui/Field';
import { Card, PageHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
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
          on
            ? 'Approve-before-send is on: answers the AI writes wait here for you. Fixed messages, like first replies, go straight out.'
            : 'Approve-before-send is off, so AI answers go out straight away. Switch it back on in Settings.'
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
        <Card>
          <h2 className="type-title">Nothing to approve</h2>
          <p>When the AI drafts an answer, it waits here for you.</p>
        </Card>
      ) : null}
      {waiting.map((draft) => (
        <Card key={draft.id} as="article" labelledBy={`draft-${draft.id}`}>
          <h2 id={`draft-${draft.id}`} className="type-title">
            {draft.renterName} asked about{' '}
            <Link href={`/lettings/${draft.lettingId}`}>{draft.address}</Link>
          </h2>
          <p className={styles.meta}>Drafted {formatDateTime(draft.createdAt)}</p>
          {draft.asked ? <blockquote className={styles.body}>{draft.asked}</blockquote> : null}
          <form action={approveAction}>
            <Stack gap={4}>
              <input type="hidden" name="messageId" value={draft.id} />
              <TextArea
                name="body"
                label="The AI’s draft"
                hint="It answers only from this home’s facts. Change anything before you send it."
                rows={10}
                defaultValue={draft.body}
              />
              <Row>
                <SubmitButton variant="secondary" pendingLabel="Sending…">
                  Approve and send
                </SubmitButton>
              </Row>
            </Stack>
          </form>
          <form action={discardAction}>
            <input type="hidden" name="messageId" value={draft.id} />
            <SubmitButton variant="quiet" pendingLabel="…">
              Don’t send this
            </SubmitButton>
          </form>
        </Card>
      ))}
    </Stack>
  );
}
