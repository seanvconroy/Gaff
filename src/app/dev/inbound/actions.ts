'use server';

import { redirect } from 'next/navigation';
import { requireDevTools } from '@/server/dev/gate';
import { receiveInboundEmail } from '@/server/enquiries/receive';

/** Development and the test copy: sends an email to a Gaff address as if Mailgun had (BA-1). */
export async function simulateInboundEmail(formData: FormData): Promise<void> {
  await requireDevTools();
  const field = (name: string) => String(formData.get(name) ?? '');
  const result = await receiveInboundEmail({
    provider: 'dev',
    providerMessageId: `<${crypto.randomUUID()}@dev.gaff.test>`,
    recipient: field('to').trim().toLowerCase(),
    from: field('from'),
    replyTo: field('replyTo') || undefined,
    subject: field('subject'),
    text: field('text'),
    receivedAt: new Date(),
  });
  redirect(`/dev/inbound?result=${result}`);
}
