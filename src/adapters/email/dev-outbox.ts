import { db } from '@/db/client';
import { devOutbox } from '@/db/schema';
import { formatAddress, type EmailSender } from '@/ports/email';

/**
 * An address the development outbox refuses, as a real provider refuses one it can't deliver
 * to. It lets "the email didn't send" be seen and tested with no real provider.
 */
export const UNDELIVERABLE_DOMAIN = 'undeliverable.gaff.test';

/** Stores mail in the database instead of sending it; shown at /dev/outbox (ADR-0010). */
export const devOutboxSender: EmailSender = {
  async send(email) {
    if (email.to.toLowerCase().endsWith(`@${UNDELIVERABLE_DOMAIN}`)) {
      throw new Error('The development outbox does not deliver to this domain');
    }
    const [row] = await db()
      .insert(devOutbox)
      .values({
        toAddress: email.to,
        fromAddress: formatAddress(email.from),
        replyTo: email.replyTo ?? null,
        subject: email.subject,
        text: email.text,
        html: email.html ?? null,
      })
      .returning({ id: devOutbox.id });
    return { providerMessageId: `dev-${row!.id}` };
  },
};
