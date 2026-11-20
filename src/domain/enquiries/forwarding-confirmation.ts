/**
 * UX-NV-17, UX-LT-18: when someone sets their mail to forward enquiries to Gaff, their mail
 * service sends a confirmation to the Gaff address, with a code to type back in or a link to
 * open. This reads the code or the link out of that email, so nobody has to hunt for it.
 *
 * It is a parser for known mail services, not AI (section 7). The email is untrusted: it is
 * read for a code and a web address, and never followed. A link is given only when it is on the
 * mail service's own site, so a made-up "confirmation" can't send anyone anywhere else.
 *
 * Built against made-up emails modelled on the services' formats; confirm against real samples
 * before the first pilot (launch checklist).
 */

export type MailService = 'gmail' | 'outlook';

export interface ForwardingConfirmation {
  service: MailService;
  /** The code to type into the mail service's forwarding settings. */
  code: string | null;
  /** The link that confirms the forwarding, on the mail service's own site. */
  link: string | null;
  /** The address the mail would be forwarded from, where the email says. */
  forwardingFrom: string | null;
}

export const mailServiceNames: Record<MailService, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const services: Array<{
  service: MailService;
  /** Who sends the confirmation: the domain the sender's address ends in. */
  senders: RegExp;
  /** The sites a confirmation link may be on. */
  hosts: RegExp;
}> = [
  {
    service: 'gmail',
    senders: /(^|[.@])google\.com$/,
    hosts: /(^|\.)google\.com$/,
  },
  {
    service: 'outlook',
    senders:
      /(^|[.@])(microsoft\.com|outlook\.com|live\.com|hotmail\.com|office365\.com|office\.com)$/,
    hosts: /(^|\.)(microsoft\.com|outlook\.com|live\.com|office365\.com|office\.com)$/,
  },
];

function addressIn(header: string): string | null {
  return EMAIL.exec(header)?.[0]?.toLowerCase() ?? null;
}

/** The service that sent it, by the sender's address, or by the "From:" line of a forward. */
function serviceOf(from: string, text: string): (typeof services)[number] | null {
  const quoted = /^\s*(?:>\s*)?from:\s*(.+)$/im.exec(text)?.[1];
  for (const sender of [addressIn(from), quoted ? addressIn(quoted) : null]) {
    if (!sender) continue;
    const found = services.find((service) => service.senders.test(sender));
    if (found) return found;
  }
  return null;
}

/** "Confirmation code: 123456789", "Your verification code is 482913", "(#123456789)". */
function codeIn(subject: string, text: string): string | null {
  const labelled =
    /\b(?:confirmation|verification|security)\s+code\b[^0-9\n]{0,24}(\d[\d -]{2,14}\d)/i.exec(
      text,
    ) ??
    /\b(?:confirmation|verification|security)\s+code\b[^0-9\n]{0,24}(\d[\d -]{2,14}\d)/i.exec(
      subject,
    ) ??
    /\(#(\d{4,12})\)/.exec(subject);
  const digits = labelled?.[1]?.replace(/\D/g, '') ?? '';
  return digits.length >= 4 && digits.length <= 12 ? digits : null;
}

/** The first secure link on one of the service's own sites. */
function linkIn(text: string, hosts: RegExp): string | null {
  for (const match of text.matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
    const candidate = match[0].replace(/[.,;:]+$/, '');
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && !url.username && hosts.test(url.hostname.toLowerCase())) {
        return candidate;
      }
    } catch {
      // Not a web address after all.
    }
  }
  return null;
}

/**
 * Reads a forwarding confirmation from Gmail or Outlook. Null for anything else: an email from
 * another sender, one that isn't about forwarding, or one with neither a code nor a link.
 */
export function readForwardingConfirmation(email: {
  from: string;
  subject: string;
  text: string;
}): ForwardingConfirmation | null {
  const found = serviceOf(email.from, email.text);
  if (!found) return null;
  if (!/\bforward/i.test(`${email.subject}\n${email.text}`)) return null;
  const code = codeIn(email.subject, email.text);
  const link = linkIn(email.text, found.hosts);
  if (!code && !link) return null;
  const forwardingFrom =
    /\b(?:receive mail from|forward(?:ing)? (?:mail|email|messages) from)\s+(\S+@\S+)/i.exec(
      email.subject,
    )?.[1] ??
    /(\S+@\S+)\s+(?:has|have) (?:requested|asked) to (?:automatically )?forward/i.exec(
      email.text,
    )?.[1] ??
    null;
  return {
    service: found.service,
    code,
    link,
    forwardingFrom: forwardingFrom ? addressIn(forwardingFrom) : null,
  };
}
