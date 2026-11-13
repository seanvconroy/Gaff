import { desc } from 'drizzle-orm';
import type { Metadata } from 'next';
import { db } from '@/db/client';
import { devOutbox } from '@/db/schema';
import { sendsRealEmail } from '@/adapters/email';
import { requireMailTools } from '@/server/dev/gate';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import styles from './outbox.module.css';

export const metadata: Metadata = { title: 'Development outbox' };
export const dynamic = 'force-dynamic';

/**
 * Development and the test copy (DEV_TOOLS=1): mail and texts the stand-ins "sent" (ADR-0010).
 * On the test copy only made-up people's mail is here; real people get real email.
 */
export default async function DevOutboxPage() {
  await requireMailTools();
  const realEmail = sendsRealEmail();
  const mail = await db().select().from(devOutbox).orderBy(desc(devOutbox.createdAt)).limit(50);
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow={realEmail ? 'Test copy' : 'Development only'}
          title="Outbox"
          lead={
            realEmail
              ? 'Email to made-up people (addresses at example.com, .test and the like), and every text. Real people get real email. Links work as they would in a real inbox.'
              : 'Email and texts Gaff would have sent. Links work as they would in a real inbox.'
          }
        />
        {mail.length === 0 ? <p>Nothing sent yet.</p> : null}
        {mail.map((message) => (
          <Card key={message.id} as="article">
            <h2 className="type-title">{message.subject}</h2>
            <p className={styles.meta}>
              To {message.toAddress} · From {message.fromAddress}
              {message.replyTo ? ` · Reply to ${message.replyTo}` : ''}
            </p>
            <pre className={styles.body}>
              {message.text.split(/(https?:\/\/\S+)/).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part}>
                    {part}
                  </a>
                ) : (
                  part
                ),
              )}
            </pre>
          </Card>
        ))}
      </Stack>
    </main>
  );
}
