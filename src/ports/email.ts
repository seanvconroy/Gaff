/** Port for sending email (ADR-0010). Adapters: development outbox, Mailgun (EU). */
export interface OutgoingEmail {
  to: string;
  from: { name: string; address: string };
  replyTo?: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

export function formatAddress({ name, address }: { name: string; address: string }): string {
  return `"${name.replace(/["\\]/g, '')}" <${address}>`;
}
