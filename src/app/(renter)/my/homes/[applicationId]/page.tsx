import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { stageWords } from '@/copy/my-homes';
import { canWithdraw } from '@/domain/enquiries/marketplace';
import { formatDate, formatDateTime } from '@/lib/format';
import { myHome } from '@/server/renters/homes';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../../renter.module.css';
import { requireRenter } from '../../renter';
import { openRenterPage, withdrawAction } from './actions';
import { MessageForm } from './MessageForm';

export const metadata: Metadata = { title: 'Your home' };

/** M79, M80, M81: one home: where it's at, the messages, and what the renter can do. */
export default async function MyHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ sent?: string; written?: string }>;
}) {
  const { user } = await requireRenter();
  const { applicationId } = await params;
  const { sent, written } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(applicationId)) notFound();
  const home = await myHome(user.id, applicationId);
  if (!home) notFound();
  const deleted = home.deletedAt !== null;
  const words = stageWords(deleted ? null : home.status, home.letterName);
  const open = !deleted && home.status !== null && home.status !== 'withdrawn';

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={home.letterName}
        title={home.title}
        lead={`${home.addressShown}. You enquired on ${formatDate(home.enquiredAt)}.`}
      />
      {sent ? (
        <Notice tone="success" title="Your enquiry is sent" role="status">
          <p>
            You’ll get a reply from {home.letterName}’s AI assistant within minutes, here and by
            email. Everyone who enquires hears back, either way.
          </p>
        </Notice>
      ) : null}
      {written ? (
        <Notice tone="success" title="Your message is sent" role="status">
          <p>You’ll get an answer here and by email.</p>
        </Notice>
      ) : null}

      <section aria-labelledby="stage-heading" className={styles.section}>
        <h2 id="stage-heading" className="type-heading">
          {words.stage}
        </h2>
        <p>{words.next}</p>
        {open ? (
          <form action={openRenterPage.bind(null, home.applicationId)}>
            <SubmitButton pendingLabel="Opening…">Open your page for this home</SubmitButton>
          </form>
        ) : null}
        {home.slug ? (
          <p>
            <Link href={`/home/${home.slug}`}>See the listing</Link>
          </p>
        ) : null}
      </section>

      <section id="messages" aria-labelledby="messages-heading" className={styles.section}>
        <h2 id="messages-heading" className="type-heading">
          Messages
        </h2>
        {home.thread.length ? (
          <ol className={styles.thread}>
            {home.thread.map((m) => (
              <li
                key={m.id}
                className={`${styles.message} ${m.author === 'renter' ? styles.fromRenter : ''}`}
              >
                <p className={styles.muted}>
                  {m.author === 'renter'
                    ? 'You'
                    : m.author === 'person'
                      ? home.letterName
                      : `${home.letterName}’s AI assistant`}{' '}
                  · {formatDateTime(m.sentAt ?? m.at)}
                </p>
                <p className={styles.body}>{m.body || 'You enquired, with no message.'}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>No messages yet.</p>
        )}
        {open ? (
          <MessageForm applicationId={home.applicationId} letterName={home.letterName} />
        ) : null}
      </section>

      {open && home.status && canWithdraw(home.status) ? (
        <section aria-labelledby="withdraw-heading" className={styles.section}>
          <h2 id="withdraw-heading" className="type-title">
            Not interested any more?
          </h2>
          <details className={styles.withdraw}>
            <summary>Withdraw my enquiry</summary>
            <Stack gap={4}>
              <p>
                {home.letterName} will see you’ve withdrawn
                {home.status === 'booked' ? ', and your viewing time goes to someone else' : ''}.
                They delete your details within 30 days.
              </p>
              <form action={withdrawAction.bind(null, home.applicationId)}>
                <SubmitButton variant="secondary" pendingLabel="Withdrawing…">
                  Yes, withdraw my enquiry
                </SubmitButton>
              </form>
            </Stack>
          </details>
        </section>
      ) : null}
    </Stack>
  );
}
