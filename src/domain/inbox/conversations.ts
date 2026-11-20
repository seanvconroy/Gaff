import { firstNameOf } from '@/domain/accounts/first-run';
import { isMine } from '@/domain/dashboard/views';

/**
 * Inbox (UX-NV-13 to UX-NV-18): one place for every conversation. A conversation is everything
 * said between the people letting a home and one other person about that home:
 *
 * - `renter`: one renter and one letting (their application);
 * - `owner`: the home's owner and one letting, where anything was sent to the owner;
 * - `email`: an email Gaff couldn't match to a home, until a person says what it is.
 *
 * Nothing new is stored for this. Conversations are read from the messages, drafts, questions
 * and received emails that are already there. A message to a referee belongs to none of them.
 *
 * "Needs you" is three things and no more (section 3): a draft waiting to be approved, a
 * question only a person can answer, and an email Gaff couldn't place. Gaff lists them; a person
 * does each one (rule 1).
 */
export type ConversationKind = 'renter' | 'owner' | 'email';

export interface ConversationRef {
  kind: ConversationKind;
  /** The application, the letting or the received email, by kind. */
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A conversation's place in an address: its kind and an ID, and nothing about anyone. */
export function conversationKey(ref: ConversationRef): string {
  return `${ref.kind}-${ref.id}`;
}

export function parseConversationKey(key: string): ConversationRef | null {
  const match = /^(renter|owner|email)-(.+)$/.exec(key);
  if (!match || !UUID.test(match[2]!)) return null;
  return { kind: match[1] as ConversationKind, id: match[2]!.toLowerCase() };
}

/** The two filter chips (UX-NV-13). */
export type Show = 'needs-you' | 'all';

/** Where a conversation opens, keeping the chip that was chosen. */
export function conversationHref(key: string, show?: Show | null): string {
  return show ? `/inbox/${key}?show=${show}` : `/inbox/${key}`;
}

export function inboxHref(show?: Show | null): string {
  return show ? `/inbox?show=${show}` : '/inbox';
}

/** A stored message, as far as Inbox reads it. */
export interface InboxMessage {
  id: string;
  lettingId: string;
  /** Null for a message to the owner about the letting as a whole. */
  applicationId: string | null;
  /** R18: set on a message to a referee about a check. */
  checkId: string | null;
  direction: 'inbound' | 'outbound';
  author: 'renter' | 'template' | 'ai' | 'person';
  authorUserId: string | null;
  channel: 'email' | 'sms';
  status: string;
  body: string;
  createdAt: Date;
  sendAt: Date | null;
  sentAt: Date | null;
}

/** The conversation a message belongs to. Null for one to a referee. */
export function conversationOf(
  message: Pick<InboxMessage, 'applicationId' | 'checkId' | 'lettingId'>,
): ConversationRef | null {
  if (message.checkId) return null;
  return message.applicationId
    ? { kind: 'renter', id: message.applicationId }
    : { kind: 'owner', id: message.lettingId };
}

/**
 * Whether a message is part of what was said. A draft waiting for approval isn't yet (it sits
 * in the reply box), nor is one a person chose not to send, one that was cancelled, or one set
 * to go later, such as a reminder for the day before a viewing.
 */
export function isSaid(message: Pick<InboxMessage, 'status' | 'sendAt'>, now: Date): boolean {
  switch (message.status) {
    case 'received':
    case 'sent':
    case 'sending':
    case 'failed':
      return true;
    case 'scheduled':
      return message.sendAt === null || message.sendAt.getTime() <= now.getTime();
    default:
      return false;
  }
}

/**
 * When a message was said: when it went, or when it arrived. One that is on its way was said
 * when it was set to go (the moment a person pressed Send on a draft), not when Gaff first wrote
 * it: a draft can be older than the reply before it.
 */
export function saidAt(message: Pick<InboxMessage, 'createdAt' | 'sendAt' | 'sentAt'>): Date {
  return message.sentAt ?? message.sendAt ?? message.createdAt;
}

/**
 * The order things were said in: by when, and at the same instant, theirs before ours. Gaff's
 * first reply is written the moment an enquiry arrives, and it is still the reply.
 */
export function inOrderSaid(
  a: Pick<InboxMessage, 'id' | 'direction' | 'createdAt' | 'sendAt' | 'sentAt'>,
  b: Pick<InboxMessage, 'id' | 'direction' | 'createdAt' | 'sendAt' | 'sentAt'>,
): number {
  const ours = (message: Pick<InboxMessage, 'direction'>) =>
    message.direction === 'outbound' ? 1 : 0;
  return saidAt(a).getTime() - saidAt(b).getTime() || ours(a) - ours(b) || a.id.localeCompare(b.id);
}

/**
 * A message with any private link in it hidden. A renter's, owner's or referee's link opens
 * their own page with no sign-in, so it is for them alone: nobody letting the home is shown it.
 */
export function withoutPrivateLinks(text: string, appUrl: string): string {
  const origin = appUrl.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(
    new RegExp(`${origin}/[A-Za-z0-9/_-]*[A-Za-z0-9_-]{32,}[^\\s<>"]*`, 'g'),
    '[their private link]',
  );
}

const GREETING = /^(hello|hi|hey|dear|good (morning|afternoon|evening))\b[^.?!]{0,60},?$/i;
const LINE_LENGTH = 120;

/** The first thing a message says, on one line: past the greeting, and cut at a word. */
export function firstLine(body: string, appUrl: string): string {
  const lines = withoutPrivateLinks(body, appUrl)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const said = lines.length > 1 && GREETING.test(lines[0]!) ? lines.slice(1) : lines;
  const line = said[0] ?? '';
  if (line.length <= LINE_LENGTH) return line;
  const cut = line.slice(0, LINE_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), LINE_LENGTH - 20)).trimEnd()}…`;
}

/** Who a line in the list is from: "Gaff", "You", a colleague's first name, or nobody named. */
export interface Readers {
  /** The person looking. */
  viewerUserId: string;
  /** The names of the people on the team, by user ID. */
  names: ReadonlyMap<string, string>;
  /** Where Gaff's own pages live, so private links can be told apart. */
  appUrl: string;
}

/** UX-AI-15: to the people letting a home, the assistant is called Gaff. */
export const ASSISTANT = 'Gaff';

/** Who wrote a message, in a word. Null for the renter's or owner's own. */
export function writerOf(
  message: Pick<InboxMessage, 'direction' | 'author' | 'authorUserId'>,
  readers: Pick<Readers, 'viewerUserId' | 'names'>,
): { who: 'them' | 'gaff' | 'you' | 'colleague'; name: string | null } {
  if (message.direction === 'inbound') return { who: 'them', name: null };
  if (message.author !== 'person') return { who: 'gaff', name: ASSISTANT };
  if (message.authorUserId === readers.viewerUserId) return { who: 'you', name: 'You' };
  const colleague = message.authorUserId ? readers.names.get(message.authorUserId) : undefined;
  return { who: 'colleague', name: colleague ? firstNameOf(colleague) : 'A colleague' };
}

/** The last line of a conversation, as the list shows it: "Gaff: Thanks for your enquiry…". */
export function lastLine(message: InboxMessage, readers: Readers): string {
  const { name } = writerOf(message, readers);
  const line = firstLine(message.body, readers.appUrl);
  return name ? `${name}: ${line}` : line;
}

/** A draft or a question that is waiting on a person, and since when. */
export interface WaitingOn {
  applicationId: string;
  since: Date;
}

export interface UnplacedEmail {
  id: string;
  /** The From header: `Gmail Team <forwarding-noreply@google.com>`. */
  from: string;
  subject: string;
  receivedAt: Date;
}

export interface Renter {
  applicationId: string;
  lettingId: string;
  fullName: string;
}

export interface Home {
  lettingId: string;
  address: string;
  /** UX-AG-9: who leads the home. Null where nobody does. */
  leadUserId: string | null;
  /** The owner's name, where an agent lets the home for them. */
  ownerName: string | null;
}

export type WaitingFor = 'draft' | 'question' | 'email';

export interface Conversation {
  key: string;
  kind: ConversationKind;
  /** Who it is with, as the list names them: a first name (UX-NV-13). */
  who: string;
  /** "Owner", where it is the home's owner. */
  role: string | null;
  /** The home, by its address. Null for an email Gaff couldn't place. */
  home: string | null;
  lettingId: string | null;
  lastLine: string;
  at: Date;
  /** What is waiting on a person, if anything. */
  waiting: WaitingFor | null;
  /** It is waiting, and on this person: they lead the home, or nobody does. */
  needsYou: boolean;
  leadUserId: string | null;
}

/** "Gmail Team <forwarding-noreply@google.com>" → "Gmail Team". An address alone stays as it is. */
export function senderName(from: string): string {
  const name = from
    .replace(/<[^>]*>/g, '')
    .replace(/["']/g, '')
    .trim();
  return name || from.replace(/[<>]/g, '').trim() || 'Someone';
}

const lastInitial = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts.at(-1)!.charAt(0).toUpperCase()}.` : '';
};

/**
 * What the list calls each renter: their first name. Where two people asking about the same
 * home share one, the first letter of the surname is added, so the rows can be told apart.
 */
export function namesInList(renters: readonly Renter[]): Map<string, string> {
  const sharing = new Map<string, number>();
  const group = (renter: Renter) =>
    `${renter.lettingId}:${firstNameOf(renter.fullName).toLowerCase()}`;
  for (const renter of renters) sharing.set(group(renter), (sharing.get(group(renter)) ?? 0) + 1);
  return new Map(
    renters.map((renter) => {
      const first = firstNameOf(renter.fullName) || 'Someone';
      const initial = (sharing.get(group(renter)) ?? 0) > 1 ? lastInitial(renter.fullName) : '';
      return [renter.applicationId, initial ? `${first} ${initial}` : first];
    }),
  );
}

const earliest = (waiting: readonly WaitingOn[]) => {
  const since = new Map<string, Date>();
  for (const one of waiting) {
    const known = since.get(one.applicationId);
    if (!known || one.since.getTime() < known.getTime()) since.set(one.applicationId, one.since);
  }
  return since;
};

/**
 * UX-NV-13: every conversation, newest first.
 *
 * - One conversation per renter per letting, however many emails they sent, and one per home
 *   with its owner. Each takes its last line and its time from the last thing said in it.
 * - A draft that is waiting isn't said yet, so it is never the last line: the renter's own
 *   words are, until a person sends it.
 * - A renter Gaff knows nothing about (their details were deleted) has no conversation.
 */
export function conversationsFrom(input: {
  messages: readonly InboxMessage[];
  drafts: readonly WaitingOn[];
  questions: readonly WaitingOn[];
  emails: readonly UnplacedEmail[];
  renters: readonly Renter[];
  homes: readonly Home[];
  readers: Readers;
  now: Date;
}): Conversation[] {
  const { readers, now } = input;
  const homes = new Map(input.homes.map((home) => [home.lettingId, home]));
  const renters = new Map(input.renters.map((renter) => [renter.applicationId, renter]));
  const listNames = namesInList(input.renters);
  const drafts = earliest(input.drafts);
  const questions = earliest(input.questions);

  // The last thing said in each conversation.
  const last = new Map<string, InboxMessage>();
  for (const message of input.messages) {
    const ref = conversationOf(message);
    if (!ref || !isSaid(message, now)) continue;
    const key = conversationKey(ref);
    const known = last.get(key);
    if (!known || inOrderSaid(message, known) > 0) last.set(key, message);
  }

  const conversations: Conversation[] = [];
  const waitingKeys = [...drafts.keys(), ...questions.keys()].map((id) =>
    conversationKey({ kind: 'renter', id }),
  );
  for (const key of new Set([...last.keys(), ...waitingKeys])) {
    const ref = parseConversationKey(key);
    if (!ref) continue;
    const message = last.get(key);
    if (ref.kind === 'renter') {
      const renter = renters.get(ref.id);
      const home = renter ? homes.get(renter.lettingId) : undefined;
      if (!renter || !home) continue;
      const waiting: WaitingFor | null = drafts.has(ref.id)
        ? 'draft'
        : questions.has(ref.id)
          ? 'question'
          : null;
      const since = drafts.get(ref.id) ?? questions.get(ref.id);
      conversations.push({
        key,
        kind: 'renter',
        who: listNames.get(ref.id) ?? 'Someone',
        role: null,
        home: home.address,
        lettingId: home.lettingId,
        lastLine: message ? lastLine(message, readers) : '',
        at: message ? saidAt(message) : (since ?? now),
        waiting,
        needsYou: waiting !== null && isMine(home, readers.viewerUserId),
        leadUserId: home.leadUserId,
      });
    } else if (ref.kind === 'owner' && message) {
      const home = homes.get(ref.id);
      if (!home) continue;
      conversations.push({
        key,
        kind: 'owner',
        who: home.ownerName ? firstNameOf(home.ownerName) : 'The owner',
        role: 'Owner',
        home: home.address,
        lettingId: home.lettingId,
        lastLine: lastLine(message, readers),
        at: saidAt(message),
        waiting: null,
        needsYou: false,
        leadUserId: home.leadUserId,
      });
    }
  }

  // An email Gaff couldn't place belongs to no home, so it is everybody's.
  for (const email of input.emails) {
    conversations.push({
      key: conversationKey({ kind: 'email', id: email.id }),
      kind: 'email',
      who: senderName(email.from),
      role: null,
      home: null,
      lettingId: null,
      lastLine: email.subject.replace(/\s+/g, ' ').trim(),
      at: email.receivedAt,
      waiting: 'email',
      needsYou: true,
      leadUserId: null,
    });
  }

  return conversations.sort(
    (a, b) => b.at.getTime() - a.at.getTime() || a.key.localeCompare(b.key),
  );
}

/** What each chip shows. "Needs you" is what waits on this person; "All" is everything. */
export function conversationsIn(
  show: Show,
  conversations: readonly Conversation[],
): Conversation[] {
  return show === 'all' ? [...conversations] : conversations.filter((c) => c.needsYou);
}

/**
 * UX-NV-13: the chip that is on. The one asked for in the address; otherwise "Needs you" when
 * anything is waiting, and "All" when nothing is.
 */
export function showFor(
  asked: string | undefined | null,
  conversations: readonly Conversation[],
): Show {
  if (asked === 'all' || asked === 'needs-you') return asked;
  return conversations.some((c) => c.needsYou) ? 'needs-you' : 'all';
}

/** UX-NV-5: what Inbox's badge counts: conversations that need this person. */
export function needingYou(conversations: readonly Conversation[]): number {
  return conversations.filter((c) => c.needsYou).length;
}

/** What is waiting, in the words the list shows beside a conversation. */
export function waitingWords(
  conversation: Pick<Conversation, 'waiting' | 'needsYou'>,
  lead: string | null,
): string | null {
  if (!conversation.waiting) return null;
  if (conversation.needsYou) return 'Needs you';
  return lead ? `Waiting for ${firstNameOf(lead)}` : 'Waiting';
}
