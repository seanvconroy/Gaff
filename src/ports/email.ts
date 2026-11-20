/** Port for sending email (ADR-0010). Adapters: development outbox, Resend, Mailgun (EU). */
export interface OutgoingEmail {
  to: string;
  from: { name: string; address: string };
  replyTo?: string;
  subject: string;
  /** The message as it was written. Always sent: it is the plain-text alternative. */
  text: string;
  /** The same message in the email layout (UX-PP-10), for mail apps that show one. */
  html?: string;
  /** The same for every retry of one message, so a provider that supports it sends it once. */
  idempotencyKey?: string;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

export function formatAddress({ name, address }: { name: string; address: string }): string {
  return `"${name.replace(/["\\]/g, '')}" <${address}>`;
}
