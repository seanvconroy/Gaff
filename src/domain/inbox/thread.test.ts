import { describe, expect, it } from 'vitest';
import type { InboxMessage } from './conversations';
import { canRemember, questionWords, replyFor, threadFrom, whenSaid, whenWords } from './thread';

const APP = 'https://app.gaff.test';
const NOW = new Date('2026-11-16T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const ANN = 'user-ann';
const NIAMH = 'user-niamh';
const readers = {
  viewerUserId: ANN,
  names: new Map([
    [ANN, 'Ann Power'],
    [NIAMH, 'Niamh Kelly'],
  ]),
  appUrl: APP,
};

let n = 0;
function message(over: Partial<InboxMessage> & { minutesAgo: number }): InboxMessage {
  n += 1;
  const at = ago(over.minutesAgo);
  const inbound = (over.direction ?? 'inbound') === 'inbound';
  return {
    id: `m${String(n).padStart(3, '0')}`,
    lettingId: 'home',
    applicationId: 'aoife',
    checkId: null,
    direction: 'inbound',
    author: inbound ? 'renter' : 'template',
    authorUserId: null,
    channel: 'email',
    status: inbound ? 'received' : 'sent',
    body: 'Hi, is it furnished?',
    createdAt: at,
    sendAt: inbound ? null : at,
    sentAt: inbound ? null : at,
    ...over,
  };
}

const thread = (messages: InboxMessage[]) =>
  threadFrom(messages, { readers, theirName: 'Aoife', now: NOW });

describe('UX-NV-14: a conversation opens as a thread, oldest first', () => {
  it('UX-NV-14: a draft a person has just sent comes after the reply before it, though Gaff wrote it earlier', () => {
    // Gaff drafted the answer the moment the enquiry arrived, before the first reply went.
    const entries = threadFrom(
      [
        message({ minutesAgo: 10, body: 'Is it furnished?' }),
        message({
          minutesAgo: 10,
          direction: 'outbound',
          author: 'ai',
          status: 'sending',
          body: 'Yes, it’s furnished.',
          sendAt: ago(1),
          sentAt: null,
        }),
        message({
          minutesAgo: 10,
          direction: 'outbound',
          body: 'Thanks for your enquiry.',
          sendAt: ago(10),
          sentAt: ago(9),
        }),
      ],
      { readers, theirName: 'Aoife', now: NOW },
    );
    expect(entries.map((entry) => entry.text)).toEqual([
      'Is it furnished?',
      'Thanks for your enquiry.',
      'Yes, it’s furnished.',
    ]);
  });

  it('marks what Gaff sent as Gaff’s, and what a person wrote as theirs (UX-AI-15, UX-NV-18)', () => {
    const entries = thread([
      message({ minutesAgo: 1, direction: 'outbound', author: 'person', authorUserId: NIAMH }),
      message({ minutesAgo: 2, direction: 'outbound', author: 'person', authorUserId: ANN }),
      message({ minutesAgo: 3, direction: 'outbound', author: 'ai' }),
      message({ minutesAgo: 4, direction: 'outbound', author: 'template' }),
      message({ minutesAgo: 5 }),
    ]);
    expect(entries.map((e) => [e.from, e.name])).toEqual([
      ['them', 'Aoife'],
      ['gaff', 'Gaff'],
      ['gaff', 'Gaff'],
      ['you', 'You'],
      ['colleague', 'Niamh'],
    ]);
    expect(entries.map((e) => e.at.getTime())).toEqual(
      [5, 4, 3, 2, 1].map((minutes) => ago(minutes).getTime()),
    );
  });

  it('puts Gaff’s first reply after the enquiry it answers, though both are stored at one instant', () => {
    // Stored in one transaction, so at the same time; the reply's ID happens to sort first.
    const reply = message({ minutesAgo: 5, direction: 'outbound', sentAt: null });
    const enquiry = message({ minutesAgo: 5 });
    expect(thread([reply, enquiry]).map((e) => e.from)).toEqual(['them', 'gaff']);
    expect(thread([enquiry, reply]).map((e) => e.from)).toEqual(['them', 'gaff']);
  });

  it('says when a message is on its way, and when it didn’t send', () => {
    const out = { direction: 'outbound' as const, sentAt: null };
    const entries = thread([
      message({ minutesAgo: 3, ...out, status: 'failed' }),
      message({ minutesAgo: 2, ...out, status: 'sending' }),
      message({ minutesAgo: 1, ...out, status: 'scheduled' }),
    ]);
    expect(entries.map((e) => e.state)).toEqual(['not_sent', 'sending', 'sending']);
  });

  it('leaves out a draft, a message nobody sent and one set to go later', () => {
    const out = { direction: 'outbound' as const, sentAt: null };
    const entries = thread([
      message({ minutesAgo: 9 }),
      message({ minutesAgo: 8, ...out, author: 'ai', status: 'awaiting_approval' }),
      message({ minutesAgo: 7, ...out, author: 'ai', status: 'discarded' }),
      message({ minutesAgo: 6, ...out, status: 'cancelled' }),
      message({ minutesAgo: 5, ...out, status: 'scheduled', sendAt: ago(-600) }),
    ]);
    expect(entries).toHaveLength(1);
  });

  it('hides a private link, and says when something went as a text', () => {
    const token = 'q7Zr0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV1wX2yZ';
    const [email, text] = thread([
      message({ minutesAgo: 2, direction: 'outbound', body: `Book here:\n${APP}/r/${token}\n` }),
      message({ minutesAgo: 1, direction: 'outbound', channel: 'sms', body: 'Viewing at 6pm.' }),
    ]);
    expect(email).toMatchObject({ text: 'Book here:\n[their private link]', byText: false });
    expect(text).toMatchObject({ byText: true });
  });
});

describe('UX-NV-14, UX-NV-15, UX-NV-18: what the reply box holds', () => {
  const draft = (id: string, minutesAgo: number) => ({
    id,
    body: 'Hello Aoife,',
    createdAt: ago(minutesAgo),
  });
  const question = (id: string, minutesAgo: number, reason = 'no_facts') => ({
    id,
    question: 'Is there a garden?',
    reason,
    createdAt: ago(minutesAgo),
  });

  it('holds a waiting draft, with what Gaff couldn’t answer marked in it', () => {
    expect(replyFor([draft('d1', 5)], [question('q1', 5)])).toEqual({
      kind: 'draft',
      draft: draft('d1', 5),
      questions: [question('q1', 5)],
      more: 0,
    });
  });

  it('holds one draft at a time: the oldest, and says how many wait behind it', () => {
    const reply = replyFor([draft('d2', 1), draft('d1', 9), draft('d3', 0)], []);
    expect(reply).toMatchObject({ kind: 'draft', draft: { id: 'd1' }, more: 2 });
  });

  it('holds the questions alone where nothing was drafted, oldest first', () => {
    const reply = replyFor([], [question('q2', 1), question('q1', 9)]);
    expect(reply).toMatchObject({ kind: 'questions', questions: [{ id: 'q1' }, { id: 'q2' }] });
  });

  it('is for writing yourself when nothing is waiting', () => {
    expect(replyFor([], [])).toEqual({ kind: 'write' });
  });
});

describe('UX-NV-15: the part Gaff couldn’t answer is marked, in words', () => {
  const words = (reason: string, question = 'Is there a garden?') =>
    questionWords({ question, reason }, 'Aoife');

  it('says what Gaff doesn’t know', () => {
    expect(words('no_facts')).toEqual({
      label: 'Gaff doesn’t know: Is there a garden?',
      why: null,
      remember: true,
    });
  });

  it('says why Gaff held an answer back', () => {
    expect(words('protected_ground')).toEqual({
      label: 'Gaff held its answer back: Is there a garden?',
      why: 'Gaff’s answer touched on something equality law protects.',
      remember: true,
    });
    expect(words('unknown_facts').why).toBe('Gaff’s answer didn’t match the facts.');
    expect(words('something_new')).toMatchObject({
      label: 'Gaff held its answer back: Is there a garden?',
      why: null,
    });
  });

  it('names a question from a draft nobody sent as one for the person', () => {
    expect(words('draft_not_sent').label).toBe('For you to answer: Is there a garden?');
  });

  it('never repeats a whole message as a label, and never remembers an answer to one (UX-NV-16)', () => {
    const message = 'Could I speak to someone about this please? My number is 087 123 4567.';
    expect(words('asked_for_person', message)).toEqual({
      label: 'Aoife asked to talk to a person',
      why: null,
      remember: false,
    });
    expect(words('letting_closed', message)).toMatchObject({
      label: 'Aoife wrote after this letting closed',
      remember: false,
    });
    expect(canRemember('no_facts')).toBe(true);
    expect(canRemember('asked_for_person')).toBe(false);
  });
});

describe('UX-NV-13: when something was said, in Irish time', () => {
  // Monday 16 November 2026, midday.
  it('is the time today, "Yesterday", then the day, then the date', () => {
    expect(whenWords(new Date('2026-11-16T09:12:00Z'), NOW)).toBe('9:12am');
    expect(whenWords(new Date('2026-11-15T23:30:00Z'), NOW)).toBe('Yesterday');
    expect(whenWords(new Date('2026-11-12T18:00:00Z'), NOW)).toBe('Thursday');
    expect(whenWords(new Date('2026-11-09T18:00:00Z'), NOW)).toBe('9 November');
    expect(whenWords(new Date('2025-12-24T18:00:00Z'), NOW)).toBe('24 December 2025');
  });

  it('goes by the day in Ireland, not in UTC', () => {
    // 11:30pm UTC on a summer Sunday is already Monday in Ireland.
    const now = new Date('2026-06-15T10:00:00Z');
    expect(whenWords(new Date('2026-06-14T23:30:00Z'), now)).toBe('12:30am');
  });

  it('adds the time in a thread', () => {
    expect(whenSaid(new Date('2026-11-16T09:12:00Z'), NOW)).toBe('9:12am');
    expect(whenSaid(new Date('2026-11-15T18:00:00Z'), NOW)).toBe('Yesterday, 6pm');
    expect(whenSaid(new Date('2026-11-09T18:00:00Z'), NOW)).toBe('9 November, 6pm');
  });
});
