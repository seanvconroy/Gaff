/** An email received at a Gaff address (R5), from any provider, before it's understood. */
export interface InboundEmail {
  provider: 'resend' | 'mailgun' | 'dev';
  providerMessageId: string;
  recipient: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  receivedAt: Date;
}

/** "halcyon-lettings+r7k2m9x4qp@in.gaff.ie" → { slug: "halcyon-lettings", ref: "r7k2m9x4qp" }. */
export function parseGaffAddress(
  address: string,
  inboundDomain: string,
): { slug: string; ref: string | null } | null {
  const match = /^([a-z0-9-]+)(?:\+([a-z0-9]+))?@(.+)$/i.exec(address.trim().toLowerCase());
  if (!match || match[3] !== inboundDomain.toLowerCase()) return null;
  return { slug: match[1]!, ref: match[2] ?? null };
}
