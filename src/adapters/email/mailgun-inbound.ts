import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InboundEmail } from '@/ports/inbound-email';

/** Mailgun signs every webhook: HMAC-SHA256 of timestamp + token with the signing key. */
export function verifyMailgunSignature(
  input: { timestamp: string; token: string; signature: string },
  signingKey: string,
  now: Date = new Date(),
): boolean {
  const timestamp = Number(input.timestamp);
  // Refuse anything older than 5 minutes, so a captured request can't be replayed later.
  if (!Number.isFinite(timestamp) || Math.abs(now.getTime() / 1000 - timestamp) > 300) {
    return false;
  }
  const expected = createHmac('sha256', signingKey)
    .update(input.timestamp + input.token)
    .digest('hex');
  const given = Buffer.from(input.signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Turns Mailgun's "forward to URL" form post into an inbound email. */
export function fromMailgunForm(form: FormData): InboundEmail | null {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };
  let headers: Array<[string, string]> = [];
  try {
    headers = JSON.parse(field('message-headers') || '[]') as Array<[string, string]>;
  } catch {
    headers = [];
  }
  const header = (name: string) =>
    headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? '';
  const messageId = header('Message-Id') || field('Message-Id');
  if (!messageId || !field('recipient')) return null;
  return {
    provider: 'mailgun',
    providerMessageId: messageId,
    recipient: field('recipient').toLowerCase(),
    from: field('from') || field('sender'),
    replyTo: header('Reply-To') || undefined,
    subject: field('subject'),
    text: field('body-plain'),
    receivedAt: new Date(Number(field('timestamp')) * 1000 || Date.now()),
  };
}
