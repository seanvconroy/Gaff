/** Port for sending email (ADR-0010). Adapters: development outbox, Resend, Mailgun (EU). */
export interface OutgoingEmail {
  to: string;
  from: { name: string; address: string };
  replyTo?: string;
  subject: string;
  text: string;
  /** The same for every retry of one message, so a provider that supports it sends it once. */
  idempotencyKey?: string;
  /** Only List-Unsubscribe and List-Unsubscribe-Post, for alerts (M86, RFC 8058). */
  headers?: Partial<Record<'List-Unsubscribe' | 'List-Unsubscribe-Post', string>>;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

export function formatAddress({ name, address }: { name: string; address: string }): string {
  return `"${name.replace(/["\\]/g, '')}" <${address}>`;
}
