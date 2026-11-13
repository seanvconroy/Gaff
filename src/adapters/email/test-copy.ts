import { TEST_COPY_REPLY_NOTE } from '@/copy/test-copy';
import type { EmailSender } from '@/ports/email';

/**
 * The test copy sends real email, so testers can follow the whole journey from their own inbox.
 * Made-up people (the seeded letters, test enquiries, fixtures) have made-up addresses, and their
 * mail goes to the outbox instead, so nothing is sent to a domain that might belong to someone.
 */

/** Kept for examples and tests (RFC 2606, RFC 6761), and example.ie, which our fixtures use. */
const MADE_UP_DOMAINS = ['example.com', 'example.net', 'example.org', 'example.ie'];
const MADE_UP_ENDINGS = ['test', 'example', 'invalid', 'localhost', 'local'];

function domainOf(address: string): string | null {
  const trimmed = address.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

/** True for an address nobody could receive mail at, such as ann@example.com or ann@halcyon.test. */
export function isMadeUpAddress(address: string): boolean {
  const domain = domainOf(address);
  if (!domain) return true;
  const ending = domain.split('.').pop()!;
  if (MADE_UP_ENDINGS.includes(ending)) return true;
  return MADE_UP_DOMAINS.some((made) => domain === made || domain.endsWith(`.${made}`));
}

/** "Ann+renter@Example.com" and "ann@example.com" are one inbox. */
export function canonicalAddress(address: string): string {
  const lower = address.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 1) return lower;
  return `${lower.slice(0, at).split('+')[0]}@${lower.slice(at + 1)}`;
}

/** TEST_EMAIL_RECIPIENTS: addresses, or "@domain" entries, separated by commas or spaces. */
export function parseAddressList(list: string | undefined): string[] | null {
  const entries = (list ?? '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('@') ? entry : canonicalAddress(entry)));
  return entries.length > 0 ? entries : null;
}

/** Whether the test copy sends this address real email. No list means anyone real. */
export function getsRealEmail(address: string, allowed: string[] | null): boolean {
  if (isMadeUpAddress(address)) return false;
  if (!allowed) return true;
  const canonical = canonicalAddress(address);
  return allowed.includes(canonical) || allowed.includes(canonical.slice(canonical.indexOf('@')));
}

export function testCopySender(config: {
  real: EmailSender;
  outbox: EmailSender;
  allowed: string[] | null;
  /** Whether replies by email reach Gaff (receiving is set up for INBOUND_DOMAIN). */
  receivesReplies: boolean;
}): EmailSender {
  return {
    async send(email) {
      if (!getsRealEmail(email.to, config.allowed)) return config.outbox.send(email);
      if (!email.replyTo || config.receivesReplies) return config.real.send(email);
      // A reply would go nowhere, so say how to write back instead.
      const { replyTo: _unreachable, ...rest } = email;
      return config.real.send({ ...rest, text: `${email.text}\n\n${TEST_COPY_REPLY_NOTE}` });
    },
  };
}
