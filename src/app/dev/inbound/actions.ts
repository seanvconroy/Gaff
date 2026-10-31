'use server';

import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { receiveInboundEmail } from '@/server/enquiries/receive';

/** Development only: sends an email to a Gaff address as if it came through Mailgun. */
export async function simulateInboundEmail(formData: FormData): Promise<void> {
  if (!env().DEV_TOOLS) throw new Error('Dev tools are off');
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
