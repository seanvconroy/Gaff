import {
  frameFooter,
  frameHeader,
  reachAPerson,
  type FrameAudience,
  type Lister,
} from '@/domain/frame/frame';
import {
  buttonLink,
  emailAudience,
  emailBlocks,
  siteName,
  type Inline,
} from '@/domain/messages/email';
import { frameCopy, fromAssistant } from './frame';

/**
 * The one layout of every email Gaff sends to a renter, an owner or a referee (UX-PP-10,
 * UX-AI-10). It is the page frame, in an email: Gaff's wordmark for a renter and the agency's
 * name for an owner or a referee; the message; one button with a readable label where the text
 * had a web address on a line of its own; then the lister's name, its PSRA licence where it has
 * one, and how to reach a person.
 *
 * The words of a message are never changed here (rule 7). A fixed template's text is laid out as
 * it was written, and the same text, untouched, is the plain-text alternative.
 */

/**
 * The words the layout adds round a message. None is a line of caution (UX-PP-6, Q46): a button
 * says what it opens, and the footer says who sent the message and how to reach a person.
 */
export const emailCopy = {
  /** What the button opens, by the kind of message. Each says what the page is for. */
  button: {
    first_reply: 'Answer a few questions',
    invitation: 'Choose a time',
    booking_confirmation: 'Change or cancel my viewing',
    reminder: 'Change or cancel my viewing',
    place_offered: 'Book this place',
    apply_invitation: 'Apply',
    checks_invitation: 'Start the checks',
    reference_request: 'Answer a few questions',
    reference_reminder: 'Answer a few questions',
    landlord_approval: 'See the summary',
    offer: 'See the offer',
    agreement_ready: 'Read and sign the agreement',
    agreement_signed: 'Read your copy',
    payment_request: 'See how to pay',
    inventory_shared: 'Look over the inventory',
  } as Record<string, string>,
  /** For a link to a renter's own page in a message that has no button of its own. */
  openPage: 'Open your page',
  /** UX-AI-2: every message has a route to a person. Replies reach the lister. */
  talkToAPerson: 'Want to talk to a person? Reply to this email and say so.',
  reachLister: (listerName: string, phone: string | null) =>
    phone
      ? `To reach ${listerName}, reply to this email or ring ${phone}.`
      : `To reach ${listerName}, reply to this email.`,
} as const;

/** The wordmark as a picture (scripts/wordmark/email-png.ts), and the size it is shown at. */
export const emailWordmark = { path: '/email/wordmark.png', width: 46, height: 27 } as const;

/**
 * The light theme's colours and the type an email is set in. An email can't read the design
 * tokens' custom properties, so the values are written out; a test holds each to its token.
 */
export const emailStyle = {
  surface: '#ffffff',
  quiet: '#f4f5f7',
  ink: '#131a2a',
  inkMuted: '#566074',
  inkInverse: '#ffffff',
  border: '#e2e5ea',
  link: '#3a5fa8',
  ai: '#3a5fa8',
  aiBg: '#ebf0f8',
  radius: '12px',
  font: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  /** Body size, the least anything a person must read is set in (UX-PP-4). */
  size: '16px',
  line: '24px',
  /** A button is 48px high, as everywhere: 12px above and below a 24px line. */
  buttonPadding: '12px 24px',
  width: 560,
} as const;

export interface EmailToLayOut {
  /** The kind of message, as the outbox records it: "invitation", "offer". */
  kind: string;
  /** Who wrote the words: a fixed template, the assistant, or a person at the lister. */
  author: 'template' | 'ai' | 'person';
  subject: string;
  /** The message as it was written. It is sent, unchanged, as the plain-text alternative. */
  body: string;
  /** Whoever lets the home. */
  lister: Lister;
  /** Where Gaff's own pages live. Only links here become the button. */
  appUrl: string;
}

const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (character) => escapes[character]!);
}

const s = emailStyle;
const text = `font-family:${s.font};font-size:${s.size};line-height:${s.line};color:${s.ink};`;
const paragraph = `margin:0 0 16px;${text}`;
const linkStyle = `color:${s.link};text-decoration:underline;`;

function link(url: string, label: string): string {
  return `<a href="${escape(url)}" style="${linkStyle}">${escape(label)}</a>`;
}

function inline(parts: Inline[]): string {
  return parts
    .map((part) => (part.type === 'text' ? escape(part.text) : link(part.url, siteName(part.url))))
    .join('');
}

/** The one button: ink, 48px high, the width of the message on a phone. */
function button(url: string, label: string): string {
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">`,
    `<tr><td align="center" bgcolor="${s.ink}" style="background-color:${s.ink};border-radius:${s.radius};">`,
    `<a href="${escape(url)}" data-email="button" style="display:block;padding:${s.buttonPadding};font-family:${s.font};font-size:${s.size};line-height:${s.line};font-weight:600;color:${s.inkInverse};text-decoration:none;border-radius:${s.radius};">${escape(label)}</a>`,
    `</td></tr></table>`,
  ].join('');
}

function words(input: { body: string; appUrl: string; kind: string; button?: string }): string {
  const blocks = emailBlocks(input.body);
  const main = buttonLink(blocks, input.appUrl);
  let buttonShown = false;
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'words':
          return `<p style="${paragraph}">${block.lines.map(inline).join('<br>')}</p>`;
        case 'list':
          return `<ul style="margin:0 0 16px;padding:0 0 0 24px;${text}">${block.items
            .map((item) => `<li style="margin:0 0 4px;">${inline(item)}</li>`)
            .join('')}</ul>`;
        case 'named-link':
          return `<p style="${paragraph}">${link(block.url, block.label)}</p>`;
        case 'link':
          if (block.url === main && !buttonShown) {
            buttonShown = true;
            return button(
              block.url,
              input.button ?? emailCopy.button[input.kind] ?? emailCopy.openPage,
            );
          }
          return `<p style="${paragraph}">${link(block.url, siteName(block.url))}</p>`;
      }
    })
    .join('\n');
}

function header(audience: FrameAudience, lister: Lister, appUrl: string): string {
  const brand = frameHeader(audience, lister);
  const mark =
    brand.brand === 'wordmark'
      ? `<img src="${escape(appUrl.replace(/\/$/, ''))}${emailWordmark.path}" width="${emailWordmark.width}" height="${emailWordmark.height}" alt="Gaff" style="display:block;border:0;">`
      : `<p style="margin:0;font-family:${s.font};font-size:18px;line-height:24px;font-weight:600;color:${s.ink};">${escape(brand.name)}</p>`;
  return `<tr><td data-email="header" style="padding:0 0 16px;border-bottom:1px solid ${s.border};">${mark}</td></tr>`;
}

function footer(audience: FrameAudience, input: EmailToLayOut): string {
  const { lister, appUrl } = input;
  const frame = frameFooter(audience, lister);
  const muted = `margin:0 0 4px;font-family:${s.font};font-size:${s.size};line-height:${s.line};color:${s.inkMuted};`;
  const privacyUrl = frame.privacyHref ? `${appUrl.replace(/\/$/, '')}${frame.privacyHref}` : null;
  const lines = [
    `<p style="${muted}">${escape(
      audience === 'renter'
        ? emailCopy.talkToAPerson
        : emailCopy.reachLister(lister.name, reachAPerson(lister).phone?.shown ?? null),
    )}</p>`,
    `<p style="${muted}"><span style="color:${s.ink};font-weight:600;">${escape(lister.name)}</span>${
      frame.licence ? escape(` · ${frameCopy.licence(frame.licence)}`) : ''
    }</p>`,
    // The first reply carries the privacy notice in its own words; it isn't said twice.
    privacyUrl && !input.body.includes(privacyUrl)
      ? `<p style="${muted}">${link(privacyUrl, frameCopy.privacy)}</p>`
      : '',
    frame.runWithGaff ? `<p style="${muted}">${escape(frameCopy.runWithGaff)}</p>` : '',
  ];
  return `<tr><td data-email="footer" style="padding:16px 0 0;border-top:1px solid ${s.border};">${lines.filter(Boolean).join('')}</td></tr>`;
}

/** UX-AI-1: what the assistant wrote is marked as the assistant's, in words. */
function assistantMark(listerName: string): string {
  return `<p data-email="assistant" style="margin:0 0 16px;"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background-color:${s.aiBg};font-family:${s.font};font-size:${s.size};line-height:${s.line};font-weight:600;color:${s.ai};">${escape(fromAssistant(listerName))}</span></p>`;
}

function page(subject: string, rows: string[]): string {
  return [
    '<!doctype html>',
    '<html lang="en-IE">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<title>${escape(subject)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background-color:${s.surface};">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${s.surface};">`,
    '<tr><td align="center" style="padding:24px 16px;">',
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:${s.width}px;text-align:left;">`,
    ...rows,
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Lays a message out. `text` is the message exactly as it was written: the plain-text
 * alternative, which still works on its own, with each web address on its own line.
 */
export function layOutEmail(input: EmailToLayOut): { html: string; text: string } {
  const audience = emailAudience(input.kind);
  const html = page(input.subject, [
    header(audience, input.lister, input.appUrl),
    `<tr><td data-email="words" style="padding:24px 0 8px;">`,
    input.author === 'ai' ? assistantMark(input.lister.name) : '',
    '<!--words-->',
    words(input),
    '<!--/words-->',
    '</td></tr>',
    footer(audience, input),
  ]);
  return { html, text: input.body };
}

/**
 * The same layout for an email from Gaff itself to someone who runs lettings: that their agency
 * is confirmed, an invitation to join it, word about its licence (section 2, "Confirming an
 * agency"). Gaff's wordmark, the words, one button, and Gaff's name. There is no lister here:
 * the email is about the reader's own agency, and it comes from Gaff.
 */
export function layOutGaffEmail(input: {
  subject: string;
  /** The message as written. A web address on a line of its own becomes the button. */
  body: string;
  /** What the button says. */
  button: string;
  appUrl: string;
}): { html: string; text: string } {
  const base = input.appUrl.replace(/\/$/, '');
  const html = page(input.subject, [
    `<tr><td data-email="header" style="padding:0 0 16px;border-bottom:1px solid ${s.border};"><img src="${escape(base)}${emailWordmark.path}" width="${emailWordmark.width}" height="${emailWordmark.height}" alt="Gaff" style="display:block;border:0;"></td></tr>`,
    `<tr><td data-email="words" style="padding:24px 0 8px;">`,
    '<!--words-->',
    words({ body: input.body, appUrl: input.appUrl, kind: 'gaff', button: input.button }),
    '<!--/words-->',
    '</td></tr>',
  ]);
  return { html, text: input.body };
}
