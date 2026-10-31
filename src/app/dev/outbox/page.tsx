import { desc } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { devOutbox } from '@/db/schema';
import { env } from '@/lib/env';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import styles from './outbox.module.css';

export const metadata: Metadata = { title: 'Development outbox' };
export const dynamic = 'force-dynamic';

/** Local development only (DEV_TOOLS=1): mail the dev adapter "sent" (ADR-0010). */
export default async function DevOutboxPage() {
  if (!env().DEV_TOOLS) notFound();
  const mail = await db().select().from(devOutbox).orderBy(desc(devOutbox.createdAt)).limit(50);
  return (
    <main className={styles.main}>
      <Stack gap={6}>
        <PageHeader
          eyebrow="Development only"
          title="Outbox"
          lead="Email Gaff would have sent. Links work as they would in a real inbox."
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
