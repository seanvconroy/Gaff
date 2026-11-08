import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { lettingsToAssign, listNeedsAttention } from '@/server/enquiries/queries';
import { Inbox } from 'lucide-react';
import { Disclosure } from '@/ui/Disclosure';
import { EmptyState } from '@/ui/EmptyState';
import { SelectField } from '@/ui/Field';
import { Card, PageHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { assignAction, dismissAction } from './actions';
import styles from './attention.module.css';

export const metadata: Metadata = { title: 'Needs attention' };

const problems: Record<string, string> = {
  not_from_a_portal:
    'This didn’t come from Daft or MyHome. It might be a forwarding confirmation: the code is in the email below.',
  no_contact_email: 'This came from a portal, but there’s no way to reach the person in it.',
  no_matching_letting: 'Gaff couldn’t tell which home this enquiry is about.',
  details_deleted:
    'A reply from someone whose details Gaff has already deleted, so it isn’t attached to them. Reply from your own email if you need to. Gaff clears this email 30 days after it arrived.',
  unknown_thread: 'This is a reply, but Gaff couldn’t find the conversation it belongs to.',
};

const done: Record<string, string> = {
  dismissed: 'Done. That email is set aside.',
  assigned: 'Done. Gaff has added the enquiry to that home and will answer it.',
  not_an_enquiry: 'Gaff can’t read that email as an enquiry, so it can’t be matched to a home.',
};

/** Emails Gaff couldn't place. Nothing is dropped: the operator decides what each one is. */
export default async function NeedsAttentionPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const member = await requireMember();
  const [emails, lettings, { done: outcome }] = await Promise.all([
    listNeedsAttention(member),
    lettingsToAssign(member),
    searchParams,
  ]);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Needs attention"
        lead="Emails Gaff couldn’t place on its own. Nothing is lost: you decide what each one is."
      />
      {outcome && done[outcome] ? (
        <Notice tone={outcome === 'not_an_enquiry' ? 'warning' : 'success'} role="status">
          <p>{done[outcome]}</p>
        </Notice>
      ) : null}
      {emails.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing needs you right now">
          <p>Gaff has placed every email it received. Anything it can’t place waits here.</p>
        </EmptyState>
      ) : null}
      {emails.map((email) => (
        <Card key={email.id} as="article" labelledBy={`email-${email.id}`}>
          <div className={styles.head}>
            <h2 id={`email-${email.id}`} className="type-title">
              {email.subject || '(no subject)'}
            </h2>
            <p className={styles.meta}>
              From {email.fromAddress} · {formatDateTime(email.receivedAt)}
            </p>
          </div>
          <Notice tone="warning">
            <p>{problems[email.problem ?? ''] ?? 'Gaff couldn’t place this email.'}</p>
          </Notice>
          <Disclosure summary="Show the email">
            <pre className={styles.body}>{email.text}</pre>
          </Disclosure>
          <Row>
            {email.problem === 'no_matching_letting' && lettings.length > 0 ? (
              <form action={assignAction} className={styles.assign}>
                <input type="hidden" name="inboundEmailId" value={email.id} />
                <SelectField
                  name={`lettingId`}
                  label="Which home is it about?"
                  options={lettings.map((l) => ({ value: l.id, label: l.addressLine1 }))}
                />
                <SubmitButton variant="secondary" pendingLabel="Matching…">
                  Match to this home
                </SubmitButton>
              </form>
            ) : null}
            <form action={dismissAction}>
              <input type="hidden" name="inboundEmailId" value={email.id} />
              <SubmitButton variant="quiet" pendingLabel="Setting aside…">
                It’s not an enquiry
              </SubmitButton>
            </form>
          </Row>
        </Card>
      ))}
    </Stack>
  );
}
