import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { mailServiceNames } from '@/domain/enquiries/forwarding-confirmation';
import { inboxHref, parseConversationKey, showFor } from '@/domain/inbox/conversations';
import { resumeHref } from '@/domain/lettings/links';
import { questionWords, whenSaid } from '@/domain/inbox/thread';
import { requireMember } from '@/server/auth/member';
import {
  type EmailThread,
  inboxFor,
  type OwnerThread,
  type RenterThread,
  threadFor,
} from '@/server/inbox/queries';
import { CopyButton } from '@/ui/CopyButton';
import { Card, CardHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { OpenConversation, Thread, ThreadHeader, ThreadMessage } from '@/ui/Thread';
import type { ThreadEntry } from '@/domain/inbox/thread';
import { InboxFrame } from '../InboxFrame';
import styles from '../inbox.module.css';
import {
  DraftReply,
  PlaceEmail,
  QuestionsReply,
  StartFromEnquiry,
  WriteReply,
} from '../ReplyForms';

export const metadata: Metadata = { title: 'Inbox' };

const TITLE = 'conversation-title';

/** Why Gaff couldn't place an email, in a line. */
const problems: Record<string, string> = {
  not_from_a_portal: 'This didn’t come from Daft or MyHome, so Gaff can’t read it as an enquiry.',
  no_contact_email: 'This came from a portal, but there’s no way to reach the person in it.',
  no_matching_letting: 'Gaff couldn’t tell which home this enquiry is about.',
  details_deleted:
    'A reply from someone whose details Gaff has already deleted, so it isn’t attached to them. Reply from your own email if you need to. Gaff clears this email 30 days after it arrived.',
  unknown_thread: 'This is a reply, but Gaff couldn’t find the conversation it belongs to.',
};

function Messages({
  label,
  entries,
  now,
}: {
  label: string;
  entries: readonly ThreadEntry[];
  now: Date;
}) {
  return (
    <Thread label={label}>
      {entries.map((entry) => (
        <ThreadMessage
          key={entry.id}
          from={entry.from}
          name={entry.name}
          when={whenSaid(entry.at, now)}
          state={entry.state}
          byText={entry.byText}
        >
          {entry.text}
        </ThreadMessage>
      ))}
    </Thread>
  );
}

/**
 * A conversation, open (UX-NV-14 to UX-NV-18): what was said, and the reply box at its foot. A
 * draft that is waiting is there already written; a question only a person can answer has its
 * field; otherwise the person can write themselves.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversation: string }>;
  searchParams: Promise<{ show?: string; done?: string }>;
}) {
  const member = await requireMember();
  const now = new Date();
  const [{ conversation }, { show: askedFor, done }] = await Promise.all([params, searchParams]);
  const ref = parseConversationKey(conversation);
  const [{ conversations, leads }, thread] = await Promise.all([
    inboxFor(member, now),
    ref ? threadFor(member, ref, now) : null,
  ]);
  const show = showFor(askedFor, conversations);
  const asked = askedFor === show ? show : null;
  // No such conversation for this person: it was dealt with, or it was never theirs to see.
  if (!thread) redirect(inboxHref(asked));
  const back = { href: inboxHref(asked), label: 'Inbox' };

  return (
    <InboxFrame
      conversations={conversations}
      leads={leads}
      show={show}
      asked={asked}
      open={thread.key}
      done={done}
      now={now}
    >
      {thread.kind === 'email' ? (
        <EmailConversation thread={thread} back={back} show={asked} now={now} />
      ) : (
        <OpenConversation labelledBy={TITLE} conversation={thread.key}>
          <ThreadHeader
            id={TITLE}
            back={back}
            title={thread.kind === 'owner' ? `${thread.name} · Owner` : thread.name}
            meta={<Link href={`/lettings/${thread.home.lettingId}`}>{thread.home.address}</Link>}
          />
          <Messages
            label={`Messages with ${thread.firstName}`}
            entries={thread.entries}
            now={now}
          />
          {thread.kind === 'renter' ? (
            <RenterReply thread={thread} show={asked} />
          ) : (
            <OwnerReply thread={thread} show={asked} />
          )}
        </OpenConversation>
      )}
    </InboxFrame>
  );
}

function RenterReply({ thread, show }: { thread: RenterThread; show: 'needs-you' | 'all' | null }) {
  const { reply, firstName } = thread;
  const shared = { conversation: thread.key, show, firstName };
  if (reply.kind === 'write') return <WriteReply {...shared} />;
  const questions = reply.questions.map((question) => ({
    id: question.id,
    ...questionWords(question, firstName),
  }));
  return reply.kind === 'draft' ? (
    <DraftReply
      {...shared}
      address={thread.home.address}
      draft={{ id: reply.draft.id, body: reply.draft.body }}
      parts={thread.draftParts}
      questions={questions}
      more={reply.more}
    />
  ) : (
    <QuestionsReply {...shared} address={thread.home.address} questions={questions} />
  );
}

function OwnerReply({ thread, show }: { thread: OwnerThread; show: 'needs-you' | 'all' | null }) {
  return thread.canWrite ? (
    <WriteReply conversation={thread.key} show={show} firstName={thread.firstName} />
  ) : (
    <p className={styles.muted}>
      Gaff has no email address for this home’s owner, so there is nothing to send from here.
    </p>
  );
}

/**
 * UX-NV-17: an email Gaff couldn't place. Where it is Gmail or Outlook confirming that mail
 * should be forwarded, the code or link is read out, with a copy button. Otherwise the one
 * question is which home it is about. The email itself is underneath.
 */
function EmailConversation({
  thread,
  back,
  show,
  now,
}: {
  thread: EmailThread;
  back: { href: string; label: string };
  show: 'needs-you' | 'all' | null;
  now: Date;
}) {
  const { confirmation } = thread;
  const service = confirmation ? mailServiceNames[confirmation.service] : null;
  return (
    <OpenConversation labelledBy={TITLE}>
      <ThreadHeader
        id={TITLE}
        back={back}
        title={thread.name}
        meta={thread.subject || 'No subject'}
      />
      {confirmation && service ? (
        <Card tone="quiet" labelledBy="confirmation-title">
          <Stack gap={4}>
            <CardHeader
              id="confirmation-title"
              level={3}
              title={
                confirmation.code
                  ? `${service}’s confirmation code`
                  : `${service}’s confirmation link`
              }
              description={
                confirmation.forwardingFrom
                  ? `${service} is checking that mail from ${confirmation.forwardingFrom} should be forwarded to Gaff.`
                  : `${service} is checking that your mail should be forwarded to Gaff.`
              }
            />
            {confirmation.code ? (
              <>
                <Row>
                  <p className={`type-heading ${styles.code}`}>{confirmation.code}</p>
                  <CopyButton value={confirmation.code} what="the confirmation code" />
                </Row>
                <p>Type it into {service}’s forwarding settings. Forwarding starts once you do.</p>
              </>
            ) : null}
            {confirmation.link ? (
              <>
                <p>
                  {confirmation.code ? 'Or open' : 'Open'} {service}’s link to confirm. Forwarding
                  starts once you do.
                </p>
                <Row>
                  <p className={styles.link}>
                    <a href={confirmation.link} target="_blank" rel="noopener noreferrer">
                      {confirmation.link}
                    </a>
                  </p>
                  <CopyButton
                    value={confirmation.link}
                    label="Copy link"
                    what="to the confirmation"
                  />
                </Row>
              </>
            ) : null}
          </Stack>
        </Card>
      ) : thread.homes.length === 0 ? (
        <Notice tone="warning">
          <p>
            {thread.problem === 'no_matching_letting'
              ? 'Gaff couldn’t tell which home this enquiry is about, and none of your homes is taking enquiries.'
              : (problems[thread.problem ?? ''] ?? 'Gaff couldn’t place this email.')}
          </p>
        </Notice>
      ) : null}
      <PlaceEmail conversation={thread.key} show={show} homes={thread.homes} />
      {thread.newHome ? (
        <StartFromEnquiry
          conversation={thread.key}
          draftHref={
            thread.newHome.draftId ? resumeHref(thread.newHome.draftId, inboxHref()) : null
          }
        />
      ) : null}
      <Messages label="The email" entries={thread.entries} now={now} />
    </OpenConversation>
  );
}
