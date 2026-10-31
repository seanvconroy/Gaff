import { formatAddress, type EmailSender } from '@/ports/email';

/** Mailgun's EU region keeps message data in the EU (ADR-0010). */
export const MAILGUN_EU_API = 'https://api.eu.mailgun.net/v3';

export function mailgunSender(config: { apiKey: string; domain: string }): EmailSender {
  const authorization = `Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}`;
  return {
    async send(email) {
      const form = new FormData();
      form.set('from', formatAddress(email.from));
      form.set('to', email.to);
      form.set('subject', email.subject);
      form.set('text', email.text);
      if (email.replyTo) form.set('h:Reply-To', email.replyTo);
      // No open or click tracking: it would follow renters around (ADR-0005).
      form.set('o:tracking', 'no');
      const response = await fetch(`${MAILGUN_EU_API}/${config.domain}/messages`, {
        method: 'POST',
        headers: { authorization },
        body: form,
      });
      if (!response.ok) {
        throw new Error(`Mailgun refused the message: ${response.status} ${await response.text()}`);
      }
      const body = (await response.json()) as { id?: string };
      if (!body.id) throw new Error('Mailgun did not return a message id');
      return { providerMessageId: body.id };
    },
  };
}
