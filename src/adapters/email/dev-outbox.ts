import { db } from '@/db/client';
import { devOutbox } from '@/db/schema';
import { formatAddress, type EmailSender } from '@/ports/email';

/** Stores mail in the database instead of sending it; shown at /dev/outbox (ADR-0010). */
export const devOutboxSender: EmailSender = {
  async send(email) {
    const [row] = await db()
      .insert(devOutbox)
      .values({
        toAddress: email.to,
        fromAddress: formatAddress(email.from),
        replyTo: email.replyTo ?? null,
        subject: email.subject,
        text: email.text,
      })
      .returning({ id: devOutbox.id });
    return { providerMessageId: `dev-${row!.id}` };
  },
};
