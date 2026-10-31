import { eq } from 'drizzle-orm';
import { db, withOrg } from '@/db/client';
import { inboundEmails, organisations } from '@/db/schema';
import { env } from '@/lib/env';
import { parseGaffAddress, type InboundEmail } from '@/ports/inbound-email';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

export type ReceiveResult = 'stored' | 'duplicate' | 'unknown_recipient';

/**
 * R5: stores an email that arrived at a Gaff address, then queues it for reading (R6). It does
 * nothing else, so a parsing problem can never lose an enquiry. Safe to call twice.
 */
export async function receiveInboundEmail(email: InboundEmail): Promise<ReceiveResult> {
  const address = parseGaffAddress(email.recipient, env().INBOUND_DOMAIN);
  if (!address) return 'unknown_recipient';
  const [organisation] = await db()
    .select({ id: organisations.id })
    .from(organisations)
    .where(eq(organisations.inboundSlug, address.slug));
  if (!organisation) return 'unknown_recipient';

  return withOrg(organisation.id, async (tx) => {
    const [stored] = await tx
      .insert(inboundEmails)
      .values({
        organisationId: organisation.id,
        provider: email.provider,
        providerMessageId: email.providerMessageId,
        recipient: email.recipient,
        fromAddress: email.from,
        replyTo: email.replyTo ?? null,
        subject: email.subject,
        text: email.text,
        receivedAt: email.receivedAt,
      })
      .onConflictDoNothing()
      .returning({ id: inboundEmails.id });
    if (!stored) return 'duplicate';

    await enqueue(tx, 'process_inbound_email', {
      organisationId: organisation.id,
      inboundEmailId: stored.id,
    });
    await recordEvent(tx, {
      organisationId: organisation.id,
      actor: { type: 'system' },
      type: 'email.received',
      subject: { type: 'inbound_email', id: stored.id },
      data: { inboundEmailId: stored.id },
    });
    return 'stored';
  });
}
