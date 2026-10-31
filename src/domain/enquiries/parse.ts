/**
 * R6: reads an enquiry email from Daft or MyHome: who it's from, how to reach them, what they
 * asked, and which advert it's about. Built against synthetic emails modelled on the portals'
 * formats; confirm against real samples before the first pilot (launch checklist).
 *
 * The text is untrusted: it is only read for labelled fields, never followed.
 */

export type Portal = 'daft' | 'myhome';

export interface ParsedEnquiry {
  portal: Portal;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  advertId: string | null;
  addressHint: string | null;
}

export type ParseResult =
  | { ok: true; enquiry: ParsedEnquiry }
  | { ok: false; reason: 'not_from_a_portal' | 'no_contact_email' };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function addressOf(header: string): string | null {
  return EMAIL.exec(header)?.[0]?.toLowerCase() ?? null;
}

function detectPortal(from: string, text: string): Portal | null {
  const sender = addressOf(from) ?? '';
  if (/(^|\.|@)daft\.ie$/.test(sender)) return 'daft';
  if (/(^|\.|@)myhome\.ie$/.test(sender)) return 'myhome';
  // A manually forwarded email keeps the portal's address in the quoted header.
  if (/^from:.*@(\w+\.)?daft\.ie/im.test(text)) return 'daft';
  if (/^from:.*@(\w+\.)?myhome\.ie/im.test(text)) return 'myhome';
  return null;
}

function labelled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im').exec(text);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

const MESSAGE_LABELS = ['message', 'enquiry', 'your message', 'comments', 'question'];
/** Lines that end the renter's message: portal footers and other labelled fields. */
const MESSAGE_END =
  /^\s*(?:(?:view (?:listing|ad|property)|ad|advert|listing|property|name|full name|e-?mail(?: address)?|phone|telephone|mobile|reply to|this (?:email|message) was sent|you(?:'re| are) receiving)\b|--+\s*$|_{3,})/i;

function messageBody(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) =>
    MESSAGE_LABELS.some((label) => new RegExp(`^\\s*${label}\\s*:`, 'i').test(line)),
  );
  if (start === -1) return '';
  const first = lines[start]!.replace(/^[^:]*:\s*/, '');
  const rest: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (MESSAGE_END.test(line)) break;
    rest.push(line);
  }
  return [first, ...rest].join('\n').trim();
}

function advertIdFrom(text: string, portal: Portal): string | null {
  const domain = portal === 'daft' ? 'daft\\.ie' : 'myhome\\.ie';
  const url = new RegExp(`https?://(?:www\\.)?${domain}/\\S+`, 'i').exec(text)?.[0];
  return url ? advertIdFromUrl(url) : null;
}

/** The numeric advert ID at the end of a Daft or MyHome link. */
export function advertIdFromUrl(url: string): string | null {
  return /\/(\d{4,})(?:[/?#]|$)/.exec(url)?.[1] ?? null;
}

export function parseEnquiry(input: {
  from: string;
  replyTo?: string | null;
  subject: string;
  text: string;
}): ParseResult {
  const portal = detectPortal(input.from, input.text);
  if (!portal) return { ok: false, reason: 'not_from_a_portal' };

  const email =
    labelled(input.text, ['e-?mail address', 'e-?mail'])?.match(EMAIL)?.[0]?.toLowerCase() ??
    (input.replyTo ? addressOf(input.replyTo) : null);
  if (!email || /@(\w+\.)?(daft|myhome)\.ie$/.test(email)) {
    return { ok: false, reason: 'no_contact_email' };
  }

  const replyToName = input.replyTo
    ?.replace(/<[^>]*>/, '')
    .replace(/["']/g, '')
    .trim();
  const name =
    labelled(input.text, ['full name', 'contact name', 'name']) ??
    (replyToName && !EMAIL.test(replyToName) ? replyToName : null) ??
    email.split('@')[0]!;

  const subjectAddress = /(?:enquiry|inquiry)\s*(?:about|for|[:–-])\s*(.+)$/i.exec(
    input.subject,
  )?.[1];
  return {
    ok: true,
    enquiry: {
      portal,
      name: name.replace(/\s+/g, ' ').slice(0, 120),
      email,
      phone: labelled(input.text, ['phone number', 'phone', 'telephone', 'mobile', 'tel']),
      message: messageBody(input.text).slice(0, 5000),
      advertId: advertIdFrom(input.text, portal),
      addressHint: labelled(input.text, ['property', 'address']) ?? subjectAddress?.trim() ?? null,
    },
  };
}

/** Irish and international numbers in one form (E.164), for matching and SMS. */
export function normalisePhone(raw: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.startsWith('+')) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (/^0\d{8,9}$/.test(digits)) return `+353${digits.slice(1)}`;
  return null;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
