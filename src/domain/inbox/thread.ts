import { TZDate } from '@date-fns/tz';
import { formatShortDate, formatTime, TIME_ZONE } from '@/lib/format';
import {
  type InboxMessage,
  inOrderSaid,
  isSaid,
  type Readers,
  saidAt,
  withoutPrivateLinks,
  writerOf,
} from './conversations';

/**
 * A conversation, open (UX-NV-14): what was said, oldest first, like any messaging app, and
 * what the reply box holds.
 */
export interface ThreadEntry {
  id: string;
  /** Whose it is: the other person's, the assistant's, the reader's own, or a colleague's. */
  from: 'them' | 'gaff' | 'you' | 'colleague';
  /** "Aoife", "Gaff", "You", "Niamh". */
  name: string;
  at: Date;
  /** `sending` is on its way; `not_sent` failed for good, and says so. */
  state: 'said' | 'sending' | 'not_sent';
  /** The words, with any private link hidden. */
  text: string;
  /** It went as a text message. */
  byText: boolean;
}

/** UX-NV-14: the messages of one conversation, in the order they were said. */
export function threadFrom(
  messages: readonly InboxMessage[],
  input: { readers: Readers; theirName: string; now: Date },
): ThreadEntry[] {
  return messages
    .filter((message) => isSaid(message, input.now))
    .sort(inOrderSaid)
    .map((message) => {
      const writer = writerOf(message, input.readers);
      return {
        id: message.id,
        from: writer.who,
        name: writer.name ?? input.theirName,
        at: saidAt(message),
        state:
          message.status === 'failed'
            ? ('not_sent' as const)
            : message.status === 'scheduled' || message.status === 'sending'
              ? ('sending' as const)
              : ('said' as const),
        text: withoutPrivateLinks(message.body, input.readers.appUrl).trim(),
        byText: message.channel === 'sms',
      };
    });
}

/** A question only a person can answer (R8), as it is stored. */
export interface OpenQuestion {
  id: string;
  question: string;
  reason: string;
  createdAt: Date;
}

/** An answer Gaff drafted that waits for a person (R29). */
export interface WaitingDraft {
  id: string;
  body: string;
  createdAt: Date;
}

/**
 * What the reply box holds (UX-NV-14, UX-NV-15, UX-NV-18):
 *
 * - `draft`: a draft waiting, already written. Any question Gaff couldn't answer is marked in
 *   it, with a field. There is one draft at a time: the oldest. `more` is how many wait behind.
 * - `questions`: nothing drafted, and something only a person can answer.
 * - `write`: nothing waiting. The person can write themselves.
 */
export type Reply =
  | { kind: 'draft'; draft: WaitingDraft; questions: OpenQuestion[]; more: number }
  | { kind: 'questions'; questions: OpenQuestion[] }
  | { kind: 'write' };

const oldestFirst = <T extends { createdAt: Date; id: string }>(rows: readonly T[]) =>
  [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );

export function replyFor(
  drafts: readonly WaitingDraft[],
  questions: readonly OpenQuestion[],
): Reply {
  const open = oldestFirst(questions);
  const [draft, ...rest] = oldestFirst(drafts);
  if (draft) return { kind: 'draft', draft, questions: open, more: rest.length };
  return open.length > 0 ? { kind: 'questions', questions: open } : { kind: 'write' };
}

/** The form field an answer to a question is typed in, so a problem with it shows there. */
export const answerField = (questionId: string) => `answer-${questionId}`;

/** Why Gaff held back an answer the AI wrote, in a line. */
const heldBack: Record<string, string> = {
  unknown_facts: 'Gaff’s answer didn’t match the facts.',
  protected_ground: 'Gaff’s answer touched on something equality law protects.',
  contact_details: 'Gaff’s answer had contact details that aren’t in the facts.',
  too_long: 'Gaff’s answer was too long.',
};

/** Reasons where what is stored as the question is the renter's whole message. */
const wholeMessage = new Set(['asked_for_person', 'letting_closed']);

/**
 * UX-NV-16: whether an answer to this can be remembered as a fact for the home. Only an answer
 * to a real question can: a request for a person, or a message after the letting closed, isn't
 * something the next renter will ask.
 */
export function canRemember(reason: string): boolean {
  return !wholeMessage.has(reason);
}

/**
 * UX-NV-15: how the part Gaff couldn't answer is marked in the reply box. `label` names the
 * field the person answers in ("Gaff doesn’t know: Is there a garden?"); `why` is one more line
 * where the reason isn't plain from the label.
 */
export function questionWords(
  question: Pick<OpenQuestion, 'question' | 'reason'>,
  firstName: string,
): { label: string; why: string | null; remember: boolean } {
  const asked = question.question.trim();
  const remember = canRemember(question.reason);
  switch (question.reason) {
    case 'no_facts':
      return { label: `Gaff doesn’t know: ${asked}`, why: null, remember };
    case 'asked_for_person':
      return { label: `${firstName} asked to talk to a person`, why: null, remember };
    case 'letting_closed':
      return {
        label: `${firstName} wrote after this letting closed`,
        why: 'Gaff answers nothing once a letting is closed.',
        remember,
      };
    case 'draft_not_sent':
      return { label: `For you to answer: ${asked}`, why: null, remember };
    default:
      return {
        label: `Gaff held its answer back: ${asked}`,
        why: heldBack[question.reason] ?? null,
        remember,
      };
  }
}

const dayNumber = (instant: Date) => {
  const local = new TZDate(instant, TIME_ZONE);
  return Math.floor(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / 86_400_000);
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * When something was said, as a messaging app puts it, in Irish time: "6:12pm" today,
 * "Yesterday", the day's name this past week, and the date before that.
 */
export function whenWords(at: Date, now: Date): string {
  const days = dayNumber(now) - dayNumber(at);
  if (days <= 0) return formatTime(at);
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS[new TZDate(at, TIME_ZONE).getDay()]!;
  return formatShortDate(at, now);
}

/** The same, with the time, for a message in a thread: "Yesterday, 6:12pm". */
export function whenSaid(at: Date, now: Date): string {
  const days = dayNumber(now) - dayNumber(at);
  return days <= 0 ? formatTime(at) : `${whenWords(at, now)}, ${formatTime(at)}`;
}
