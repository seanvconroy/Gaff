/**
 * Forwarding enquiries (section 4 of the UX redesign, UX-LT-17 to UX-LT-20). An operator who
 * advertises on Daft or MyHome sends those enquiries to Gaff with one forwarding rule in their own
 * mail. Gaff never fetches anything from a portal or a mail service (Q31): the person changes their
 * own mail settings, and Gaff only reads what arrives at its own address.
 *
 * So whether forwarding is in place is known only from what has actually arrived through a rule:
 * the test enquiry Gaff sent to the person's mailbox, coming back forwarded (UX-LT-19), or a real
 * enquiry from a portal. A mail service's confirmation email is not enough on its own: Gmail sends
 * it when the address is added, before any rule forwards anything.
 *
 * The rule is in the operator's mailbox and covers every home they let, so this is known for the
 * organisation, not for each letting: the flow is done once per account.
 */

/** Where the person's Daft enquiries arrive: the first screen's three cards. */
export const forwardingServices = ['gmail', 'outlook', 'other'] as const;
export type ForwardingService = (typeof forwardingServices)[number];

export function isForwardingService(value: unknown): value is ForwardingService {
  return typeof value === 'string' && (forwardingServices as readonly string[]).includes(value);
}

/**
 * Which mail services' confirmations the confirming screen looks for. "Something else" may be
 * any mail service, so any confirmation Gaff can read counts.
 */
export function confirmationsFor(service: ForwardingService): ReadonlyArray<'gmail' | 'outlook'> {
  return service === 'other' ? ['gmail', 'outlook'] : [service];
}

/** What Gaff knows about an organisation's forwarding, from what has arrived. */
export interface ForwardingFacts {
  /** When mail first came through a rule: the test, or an enquiry from a portal. */
  worksAt: Date | null;
  /** When the latest test enquiry was sent to the person's mailbox. */
  testSentAt: Date | null;
  /** When that test came back through the rule. Cleared each time a test is sent. */
  testArrivedAt: Date | null;
}

export const noForwarding: ForwardingFacts = { worksAt: null, testSentAt: null, testArrivedAt: null };

export function forwardingInPlace(facts: Pick<ForwardingFacts, 'worksAt'>): boolean {
  return facts.worksAt !== null;
}

/**
 * The seam for work package WP-27 (the setup checklist), which offers the flow again until it's
 * done (UX-LT-19): whether forwarding is still to do. It is done once a test enquiry has come
 * back through the rule, or a real enquiry has, whichever is first.
 */
export function forwardingStillToDo(facts: Pick<ForwardingFacts, 'worksAt'>): boolean {
  return !forwardingInPlace(facts);
}

/** The last screen (UX-LT-19): nothing sent yet, waiting for the test to come back, or answered. */
export type TestState = 'not_sent' | 'waiting' | 'arrived';

export function testState(facts: ForwardingFacts): TestState {
  if (!facts.testSentAt) return 'not_sent';
  return facts.testArrivedAt ? 'arrived' : 'waiting';
}

/**
 * The reference a test enquiry carries, so Gaff knows it when the rule forwards it back. Short,
 * random and lower case, like a renter's reply reference: it can't be guessed, and it is no one's
 * personal data.
 */
const REF_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const TEST_REF_LENGTH = 12;

export function newTestRef(random: Uint8Array): string {
  if (random.length < TEST_REF_LENGTH) throw new Error('newTestRef needs twelve random bytes');
  return Array.from(random.slice(0, TEST_REF_LENGTH), (b) => REF_ALPHABET[b % 32]).join('');
}

/** How the reference is written in the test email: "Gaff test reference: 4k7m…". */
export function testRefLine(ref: string): string {
  return `Gaff test reference: ${ref}`;
}

/**
 * Whether an email that arrived is the test enquiry coming back. The email is untrusted text: it
 * is only searched for the reference line, written exactly as Gaff wrote it. A mail service may
 * quote a forwarded email ("> "), so the line may start with quote marks.
 */
export function isTestEnquiry(
  email: { subject: string; text: string },
  ref: string | null,
): boolean {
  if (!ref || !/^[a-z0-9]+$/.test(ref)) return false;
  const line = new RegExp(`^[>\\s]*${testRefLine(ref)}\\s*$`, 'm');
  return line.test(email.text) || email.subject.includes(`(${ref})`);
}

/** The made-up renter the test enquiry comes from. Not a person, and never stored. */
export const TEST_RENTER = 'Sam Sample';

/**
 * Where the flow was opened from: a letting (its page, Today's row for it, or just after it went
 * live), or nowhere in particular (Settings). Closing the flow goes back there, and the test's
 * reply is the one a renter would get about that home.
 */
export interface ForwardingFrom {
  lettingId?: string | null;
  /** Opened just after go-live: the letting's page then says it's live (UX-FL-4). */
  justLive?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads where the flow was opened from out of its query. Anything that isn't an ID is ignored. */
export function forwardingFromQuery(query: {
  letting?: string | string[];
  live?: string | string[];
}): ForwardingFrom {
  const lettingId =
    typeof query.letting === 'string' && UUID.test(query.letting) ? query.letting : null;
  return { lettingId, justLive: lettingId !== null && query.live === '1' };
}

function query(from: ForwardingFrom): string {
  if (!from.lettingId || !UUID.test(from.lettingId)) return '';
  return `?letting=${from.lettingId}${from.justLive ? '&live=1' : ''}`;
}

export type ForwardingScreen = 'service' | 'steps' | 'confirm' | 'test';

/** The four screens' addresses: /forwarding, then /forwarding/gmail, …/confirm, …/test. */
export function forwardingHref(
  from: ForwardingFrom = {},
  screen: ForwardingScreen = 'service',
  service: ForwardingService = 'other',
): string {
  const path =
    screen === 'service'
      ? '/forwarding'
      : screen === 'steps'
        ? `/forwarding/${service}`
        : `/forwarding/${service}/${screen}`;
  return `${path}${query(from)}`;
}

/** Where closing the flow, or finishing it, goes. */
export function forwardingLeaveHref(from: ForwardingFrom): string {
  if (!from.lettingId || !UUID.test(from.lettingId)) return '/settings';
  return `/lettings/${from.lettingId}${from.justLive ? '?saved=live' : ''}`;
}
