import type { FrameAudience } from '@/domain/frame/frame';

/**
 * The rules of the one layout every email to a renter, an owner or a referee is sent in
 * (UX-PP-10, UX-AI-10). A message is written once, as plain text, by a fixed template, by the
 * assistant or by a person. The layout never changes a word of it: it reads the text's own shape
 * (paragraphs, a list, a link on its own line) and lays that out, with the link as a button.
 */

/** Who an email of this kind is written to. The frame is theirs, as on a page (UX-PP-9). */
export function emailAudience(kind: string): FrameAudience {
  if (kind === 'landlord_approval' || kind === 'owner_message') return 'owner';
  if (kind === 'reference_request' || kind === 'reference_reminder') return 'referee';
  return 'renter';
}

/**
 * Who an email says it is from. Every message is "Halcyon Lettings via Gaff". One a person wrote
 * themselves, to a renter or an owner, is marked as theirs: "Ann Power, Halcyon Lettings via
 * Gaff" (UX-NV-18). Its words are sent as written, so the name is where it's said.
 */
export function senderName(input: {
  kind: string;
  operatorName: string;
  /** The name of the person who wrote it, where a person did. */
  writer: string | null;
}): string {
  const lister = `${input.operatorName} via Gaff`;
  const written = input.kind === 'message' || input.kind === 'owner_message';
  const writer = input.writer?.replace(/[<>"\r\n]/g, '').trim();
  return written && writer ? `${writer}, ${lister}` : lister;
}

/** A run of words, or a web address found among them. */
export type Inline = { type: 'text'; text: string } | { type: 'address'; url: string };

export type EmailBlock =
  /** Lines of words, kept on their own lines as written. */
  | { type: 'words'; lines: Inline[][] }
  /** Lines the text wrote as "- " items. */
  | { type: 'list'; items: Inline[][] }
  /** A web address on a line of its own: what the message asks the reader to open. */
  | { type: 'link'; url: string }
  /** "How we use your details: https://…": words that name a web address. */
  | { type: 'named-link'; label: string; url: string };

const ADDRESS = /https?:\/\/[^\s<>"]+/g;
const ONLY_ADDRESS = /^https?:\/\/[^\s<>"]+$/;
const NAMED_ADDRESS = /^([^:\n]{1,80}): (https?:\/\/[^\s<>"]+)$/;

/** Splits a line into its words and any web addresses among them. */
export function inlineParts(line: string): Inline[] {
  const parts: Inline[] = [];
  let at = 0;
  for (const match of line.matchAll(ADDRESS)) {
    // A full stop or comma straight after an address ends the sentence, not the address.
    const url = match[0].replace(/[.,;:!?)]+$/, '');
    if (match.index > at) parts.push({ type: 'text', text: line.slice(at, match.index) });
    parts.push({ type: 'address', url });
    at = match.index + url.length;
  }
  if (at < line.length) parts.push({ type: 'text', text: line.slice(at) });
  return parts;
}

/**
 * Reads a message's text into blocks, in order, losing nothing: every character of the text is
 * in exactly one block, apart from the line breaks between them.
 */
export function emailBlocks(body: string): EmailBlock[] {
  const blocks: EmailBlock[] = [];
  for (const paragraph of body.split(/\n{2,}/)) {
    let words: Inline[][] = [];
    let items: Inline[][] = [];
    const flush = () => {
      if (words.length > 0) blocks.push({ type: 'words', lines: words });
      if (items.length > 0) blocks.push({ type: 'list', items });
      words = [];
      items = [];
    };
    for (const line of paragraph.split('\n')) {
      if (line.trim() === '') continue;
      const named = NAMED_ADDRESS.exec(line);
      if (ONLY_ADDRESS.test(line)) {
        flush();
        blocks.push({ type: 'link', url: line });
      } else if (named) {
        flush();
        blocks.push({ type: 'named-link', label: named[1]!, url: named[2]! });
      } else if (line.startsWith('- ')) {
        if (words.length > 0) flush();
        items.push(inlineParts(line.slice(2)));
      } else {
        if (items.length > 0) flush();
        words.push(inlineParts(line));
      }
    }
    flush();
  }
  return blocks;
}

/**
 * UX-PP-10: the one button of an email is the first link on its own line that leads to one of
 * Gaff's own pages. Any other web address is shown as a quiet link, never as a button: only
 * Gaff's own links get the weight of one.
 */
export function buttonLink(blocks: EmailBlock[], appUrl: string): string | null {
  const own = (url: string) => sameSite(url, appUrl);
  const first = blocks.find((block) => block.type === 'link' && own(block.url));
  return first?.type === 'link' ? first.url : null;
}

function sameSite(url: string, appUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

/**
 * UX-PP-10: a web address is never shown as itself. Where the words around it don't name it, it
 * is named by the site it leads to ("daft.ie"), so a reader still sees where a link goes.
 */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}
