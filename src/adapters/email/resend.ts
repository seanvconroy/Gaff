import { formatAddress, type EmailSender } from '@/ports/email';

export const RESEND_API = 'https://api.resend.com';

/**
 * Resend (ADR-0014). Keep open and click tracking off on the sending domain: they'd follow
 * renters around (ADR-0005). Retries of the same message reuse its idempotency key, so a retry
 * after a lost response never sends it twice.
 */
export function resendSender(config: { apiKey: string }): EmailSender {
  return {
    async send(email) {
      const response = await fetch(`${RESEND_API}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
          ...(email.idempotencyKey ? { 'idempotency-key': email.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: formatAddress(email.from),
          to: [email.to],
          subject: email.subject,
          text: email.text,
          ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        }),
      });
      if (!response.ok) {
        // Resend's error name only ("validation_error", "rate_limit_exceeded"): its message can
        // repeat the address, and failures are stored with the message.
        const error = (await response.json().catch(() => ({}))) as { name?: string };
        throw new Error(`Resend refused the message: ${response.status} ${error.name ?? ''}`);
      }
      const body = (await response.json()) as { id?: string };
      if (!body.id) throw new Error('Resend did not return a message id');
      return { providerMessageId: body.id };
    },
  };
}
