import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { parseGaffAddress, type InboundEmail } from '@/ports/inbound-email';
import { RESEND_API } from './resend';

/**
 * Resend signs webhooks the Svix way: HMAC-SHA256 of "id.timestamp.body" with the secret
 * (base64 after "whsec_"), sent as one or more space-separated "v1,<base64>" signatures.
 */
export function verifyResendWebhook(
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  secret: string,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  // Refuse anything more than 5 minutes off, so a captured request can't be replayed later.
  if (!Number.isFinite(seconds) || Math.abs(now.getTime() / 1000 - seconds) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The webhook says an email arrived; its content is fetched separately. */
export const emailReceivedEvent = z.object({
  type: z.literal('email.received'),
  data: z.object({ email_id: z.string().min(1) }),
});

const addresses = z.array(z.string()).nullish();

/** GET /emails/receiving/{id}: the parts of a received email that Gaff reads. */
export const receivedEmailSchema = z.object({
  id: z.string(),
  from: z.string().nullish(),
  to: addresses,
  cc: addresses,
  received_for: addresses,
  reply_to: addresses,
  subject: z.string().nullish(),
  text: z.string().nullish(),
  html: z.string().nullish(),
  message_id: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type ReceivedEmail = z.infer<typeof receivedEmailSchema>;

export async function fetchReceivedEmail(apiKey: string, emailId: string): Promise<ReceivedEmail> {
  const response = await fetch(`${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Resend: couldn't fetch a received email (${response.status})`);
  return receivedEmailSchema.parse(await response.json());
}

/** "Halcyon <Halcyon+R7@In.Gaff.ie>" → "halcyon+r7@in.gaff.ie". */
function bareAddress(value: string): string {
  return (/<([^>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();
}

/** A plain-text version of an HTML-only email, good enough for reading an enquiry. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Turns a received email into an inbound email. A forwarded enquiry keeps its original "To"
 * (the agent's own address), so the Gaff address is looked for among the addresses it was
 * received for first, then To and Cc.
 */
export function fromResendEmail(email: ReceivedEmail, inboundDomain: string): InboundEmail | null {
  const candidates = [...(email.received_for ?? []), ...(email.to ?? []), ...(email.cc ?? [])].map(
    bareAddress,
  );
  if (candidates.length === 0) return null;
  const recipient =
    candidates.find((address) => parseGaffAddress(address, inboundDomain)) ?? candidates[0]!;
  return {
    provider: 'resend',
    providerMessageId: email.message_id || email.id,
    recipient,
    from: email.from ?? '',
    replyTo: email.reply_to?.[0] || undefined,
    subject: email.subject ?? '',
    text: email.text || (email.html ? htmlToText(email.html) : ''),
    receivedAt: email.created_at ? new Date(email.created_at) : new Date(),
  };
}
