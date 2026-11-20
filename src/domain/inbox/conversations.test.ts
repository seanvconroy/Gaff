import { describe, expect, it } from 'vitest';
import {
  type Home,
  type InboxMessage,
  type Renter,
  conversationHref,
  conversationKey,
  conversationOf,
  conversationsFrom,
  conversationsIn,
  firstLine,
  isSaid,
  lastLine,
  namesInList,
  needingYou,
  parseConversationKey,
  senderName,
  showFor,
  waitingWords,
  withoutPrivateLinks,
} from './conversations';

const APP = 'https://app.gaff.test';
const NOW = new Date('2026-11-16T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ANN = 'user-ann';
const NIAMH = 'user-niamh';
const HOME = id(1);
const OTHER_HOME = id(2);
const AOIFE = id(11);
const CIARAN = id(12);
const SORCHA = id(13);

const homes: Home[] = [
  { lettingId: HOME, address: '12 Ranelagh Road', leadUserId: ANN, ownerName: 'Tom Kelly' },
  { lettingId: OTHER_HOME, address: '4 Harbour View', leadUserId: NIAMH, ownerName: null },
];
const renters: Renter[] = [
  { applicationId: AOIFE, lettingId: HOME, fullName: 'Aoife Byrne' },
  { applicationId: CIARAN, lettingId: HOME, fullName: 'Ciarán Ó Súilleabháin' },
  { applicationId: SORCHA, lettingId: OTHER_HOME, fullName: 'Sorcha Nolan' },
];
const readers = {
  viewerUserId: ANN,
  names: new Map([
    [ANN, 'Ann Power'],
    [NIAMH, 'Niamh Kelly'],
  ]),
  appUrl: APP,
};

let n = 100;
function message(over: Partial<InboxMessage> & { minutesAgo?: number }): InboxMessage {
  n += 1;
  const at = ago(over.minutesAgo ?? 0);
  const inbound = (over.direction ?? 'inbound') === 'inbound';
  return {
    id: id(n),
    lettingId: HOME,
    applicationId: AOIFE,
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

const list = (input: Partial<Parameters<typeof conversationsFrom>[0]>) =>
  conversationsFrom({
    messages: [],
    drafts: [],
    questions: [],
    emails: [],
    renters,
    homes,
    readers,
    now: NOW,
    ...input,
  });

describe('UX-NV-13: a conversation has a place in an address that says nothing about anyone', () => {
  it('is its kind and an ID', () => {
    expect(conversationKey({ kind: 'renter', id: AOIFE })).toBe(`renter-${AOIFE}`);
    expect(parseConversationKey(`owner-${HOME}`)).toEqual({ kind: 'owner', id: HOME });
    expect(parseConversationKey(`email-${id(5)}`)).toEqual({ kind: 'email', id: id(5) });
  });

  it('is nothing else', () => {
    for (const key of ['', 'renter-', 'renter-aoife.byrne@example.ie', `staff-${AOIFE}`, AOIFE]) {
      expect(parseConversationKey(key)).toBeNull();
    }
  });

  it('opens at its own address, keeping the chip that was chosen', () => {
    expect(conversationHref(`renter-${AOIFE}`)).toBe(`/inbox/renter-${AOIFE}`);
    expect(conversationHref(`renter-${AOIFE}`, 'all')).toBe(`/inbox/renter-${AOIFE}?show=all`);
  });
});

describe('UX-NV-13: messages are grouped into one conversation per renter per letting', () => {
  it('puts a renter’s messages, and Gaff’s replies to them, in one conversation', () => {
    const conversations = list({
      messages: [
        message({ minutesAgo: 30, body: 'Hi, is it furnished?' }),
        message({
          minutesAgo: 29,
          direction: 'outbound',
          body: 'Hello Aoife,\n\nThanks for your enquiry about 12 Ranelagh Road.',
        }),
        message({ minutesAgo: 5, body: 'Thanks. Is there a garden?' }),
      ],
    });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      key: `renter-${AOIFE}`,
      kind: 'renter',
      who: 'Aoife',
      home: '12 Ranelagh Road',
      lastLine: 'Thanks. Is there a garden?',
      at: ago(5),
      waiting: null,
      needsYou: false,
    });
  });

  it('keeps two renters of one home, and one renter’s two homes, apart', () => {
    const conversations = list({
      messages: [
        message({ minutesAgo: 30 }),
        message({ minutesAgo: 20, applicationId: CIARAN }),
        message({ minutesAgo: 10, applicationId: SORCHA, lettingId: OTHER_HOME }),
      ],
    });
    expect(conversations.map((c) => [c.who, c.home])).toEqual([
      ['Sorcha', '4 Harbour View'],
      ['Ciarán', '12 Ranelagh Road'],
      ['Aoife', '12 Ranelagh Road'],
    ]);
  });

  it('gives the owner a conversation of their own, where something was sent to them', () => {
    const conversations = list({
      messages: [
        message({ minutesAgo: 30 }),
        message({
          minutesAgo: 10,
          applicationId: null,
          direction: 'outbound',
          body: 'Hello Tom,\n\nPlease look over the people who applied for 12 Ranelagh Road.',
        }),
      ],
    });
    expect(conversations[0]).toMatchObject({
      key: `owner-${HOME}`,
      kind: 'owner',
      who: 'Tom',
      role: 'Owner',
      home: '12 Ranelagh Road',
      lastLine: 'Gaff: Please look over the people who applied for 12 Ranelagh Road.',
      needsYou: false,
    });
    // No owner conversation where nothing was ever sent to one.
    expect(list({ messages: [message({})] }).map((c) => c.kind)).toEqual(['renter']);
  });

  it('leaves a message to a referee out of every conversation', () => {
    const toReferee = message({
      direction: 'outbound',
      checkId: id(900),
      body: 'Hello Mary,\n\nAoife Byrne gave your name as a previous landlord.',
    });
    expect(conversationOf(toReferee)).toBeNull();
    const conversations = list({ messages: [message({ minutesAgo: 30 }), toReferee] });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.lastLine).toBe('Hi, is it furnished?');
  });

  it('has no conversation for a renter whose details were deleted', () => {
    expect(
      list({ messages: [message({ applicationId: id(99) })], drafts: [], questions: [] }),
    ).toEqual([]);
  });

  it('names an email Gaff couldn’t place by who sent it and its subject, with no home', () => {
    const [conversation] = list({
      emails: [
        {
          id: id(5),
          from: 'Gmail Team <forwarding-noreply@google.com>',
          subject: '(#123456789) Gmail Forwarding Confirmation',
          receivedAt: ago(3),
        },
      ],
    });
    expect(conversation).toMatchObject({
      key: `email-${id(5)}`,
      kind: 'email',
      who: 'Gmail Team',
      home: null,
      lastLine: '(#123456789) Gmail Forwarding Confirmation',
      at: ago(3),
      waiting: 'email',
      needsYou: true,
    });
  });
});

describe('UX-NV-13: the list is newest first, by the last thing said', () => {
  it('orders by the last message that was said, whoever said it', () => {
    const conversations = list({
      messages: [
        message({ minutesAgo: 200, applicationId: CIARAN }),
        message({ minutesAgo: 300 }),
        message({ minutesAgo: 1, direction: 'outbound', body: 'Hello Aoife,\n\nYes, it is.' }),
        message({ minutesAgo: 60, applicationId: SORCHA, lettingId: OTHER_HOME }),
      ],
    });
    expect(conversations.map((c) => c.who)).toEqual(['Aoife', 'Sorcha', 'Ciarán']);
  });

  it('takes Gaff’s reply as the last line when it was stored at the same instant as the enquiry', () => {
    const reply = message({
      minutesAgo: 5,
      direction: 'outbound',
      sentAt: null,
      status: 'scheduled',
      body: 'Hello Aoife,\n\nThanks for your enquiry.',
    });
    const enquiry = message({ minutesAgo: 5, body: 'Hi, is it furnished?' });
    for (const messages of [
      [reply, enquiry],
      [enquiry, reply],
    ]) {
      expect(list({ messages })[0]?.lastLine).toBe('Gaff: Thanks for your enquiry.');
    }
  });

  it('never takes its last line from a draft, a message nobody sent, or one set to go later', () => {
    const said = message({ minutesAgo: 30, body: 'Hi, is it furnished?' });
    for (const status of ['awaiting_approval', 'discarded', 'cancelled']) {
      const [conversation] = list({
        messages: [
          said,
          message({ minutesAgo: 1, direction: 'outbound', author: 'ai', status, sentAt: null }),
        ],
      });
      expect(conversation).toMatchObject({ lastLine: 'Hi, is it furnished?', at: ago(30) });
    }
    // A reminder for tomorrow isn't said yet; one that is due now is on its way.
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60_000);
    const reminder = { direction: 'outbound' as const, status: 'scheduled', sentAt: null };
    expect(isSaid({ status: 'scheduled', sendAt: tomorrow }, NOW)).toBe(false);
    expect(isSaid({ status: 'scheduled', sendAt: ago(1) }, NOW)).toBe(true);
    expect(
      list({ messages: [said, message({ ...reminder, sendAt: tomorrow })] })[0]!.lastLine,
    ).toBe('Hi, is it furnished?');
  });
});

describe('UX-NV-13: who a row is with, at a glance', () => {
  it('uses a first name only', () => {
    expect(namesInList(renters).get(AOIFE)).toBe('Aoife');
  });

  it('adds the first letter of the surname where two people asking about one home share a first name', () => {
    const names = namesInList([
      ...renters,
      { applicationId: id(14), lettingId: HOME, fullName: 'Aoife Brennan Walsh' },
      { applicationId: id(15), lettingId: OTHER_HOME, fullName: 'aoife kelly' },
    ]);
    expect(names.get(AOIFE)).toBe('Aoife B.');
    expect(names.get(id(14))).toBe('Aoife W.');
    // The same first name at another home needs nothing added.
    expect(names.get(id(15))).toBe('aoife');
  });

  it('says who wrote the last line: Gaff, you or a colleague, and nothing for the renter', () => {
    const out = { direction: 'outbound' as const, body: 'Hello Aoife,\n\nYes, it’s furnished.' };
    expect(lastLine(message({ ...out, author: 'ai' }), readers)).toBe('Gaff: Yes, it’s furnished.');
    expect(lastLine(message({ ...out, author: 'template' }), readers)).toBe(
      'Gaff: Yes, it’s furnished.',
    );
    expect(lastLine(message({ ...out, author: 'person', authorUserId: ANN }), readers)).toBe(
      'You: Yes, it’s furnished.',
    );
    expect(lastLine(message({ ...out, author: 'person', authorUserId: NIAMH }), readers)).toBe(
      'Niamh: Yes, it’s furnished.',
    );
    expect(lastLine(message({ body: 'Hi there,\nIs there parking?' }), readers)).toBe(
      'Is there parking?',
    );
  });

  it('cuts a long line at a word', () => {
    const line = firstLine(`${'A long question about the home and its garden. '.repeat(6)}`, APP);
    expect(line.length).toBeLessThanOrEqual(121);
    expect(line.endsWith('…')).toBe(true);
    expect(line).not.toMatch(/\s…$/);
  });

  it('reads a sender’s name out of the From line', () => {
    expect(senderName('"Gmail Team" <forwarding-noreply@google.com>')).toBe('Gmail Team');
    expect(senderName('someone@example.ie')).toBe('someone@example.ie');
    expect(senderName('<someone@example.ie>')).toBe('someone@example.ie');
  });
});

describe('UX-NV-14: a private link is never shown to the people letting the home', () => {
  const token = 'q7Zr0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV1wX2yZ';

  it('hides a renter’s, an owner’s and a referee’s link, and leaves other addresses alone', () => {
    const body = [
      `Answer a few questions: ${APP}/r/${token}`,
      `${APP}/approve/${token}?from=email`,
      `How we use your details: ${APP}/privacy/halcyon-lettings`,
      'The advert: https://www.daft.ie/for-rent/apartment-12-ranelagh-road-ranelagh-dublin-6/123456',
    ].join('\n');
    expect(withoutPrivateLinks(body, `${APP}/`)).toBe(
      [
        'Answer a few questions: [their private link]',
        '[their private link]',
        `How we use your details: ${APP}/privacy/halcyon-lettings`,
        'The advert: https://www.daft.ie/for-rent/apartment-12-ranelagh-road-ranelagh-dublin-6/123456',
      ].join('\n'),
    );
  });

  it('keeps it out of the last line too', () => {
    expect(firstLine(`${APP}/r/${token}`, APP)).toBe('[their private link]');
  });
});

describe('UX-NV-13: "Needs you" is a draft to approve, a question only you can answer, or an email Gaff couldn’t place', () => {
  const said = [
    message({ minutesAgo: 30 }),
    message({ minutesAgo: 20, applicationId: CIARAN }),
    message({ minutesAgo: 10, applicationId: SORCHA, lettingId: OTHER_HOME }),
  ];

  it('marks a conversation with a draft waiting, or a question, and nothing else', () => {
    const conversations = list({
      messages: said,
      drafts: [{ applicationId: AOIFE, since: ago(29) }],
      questions: [{ applicationId: CIARAN, since: ago(19) }],
    });
    expect(conversations.map((c) => [c.who, c.waiting, c.needsYou])).toEqual([
      ['Sorcha', null, false],
      ['Ciarán', 'question', true],
      ['Aoife', 'draft', true],
    ]);
  });

  it('counts a conversation once when it has a draft and a question (UX-NV-15)', () => {
    const conversations = list({
      messages: said,
      drafts: [{ applicationId: AOIFE, since: ago(29) }],
      questions: [
        { applicationId: AOIFE, since: ago(29) },
        { applicationId: AOIFE, since: ago(28) },
      ],
    });
    expect(conversations.find((c) => c.who === 'Aoife')).toMatchObject({ waiting: 'draft' });
    expect(needingYou(conversations)).toBe(1);
  });

  it('is what waits on this person: a home they lead, or one nobody leads', () => {
    const waiting = {
      messages: said,
      questions: [
        { applicationId: AOIFE, since: ago(29) },
        { applicationId: SORCHA, since: ago(9) },
      ],
    };
    const forAnn = list(waiting);
    // Sorcha asked about a home Niamh leads: it is waiting, and not on Ann.
    expect(forAnn.find((c) => c.who === 'Sorcha')).toMatchObject({
      waiting: 'question',
      needsYou: false,
    });
    expect(conversationsIn('needs-you', forAnn).map((c) => c.who)).toEqual(['Aoife']);
    expect(conversationsIn('all', forAnn)).toHaveLength(3);
    expect(
      waitingWords(
        forAnn.find((c) => c.who === 'Sorcha')!,
        'Niamh Kelly',
      ),
    ).toBe('Waiting for Niamh');
    expect(
      waitingWords(
        forAnn.find((c) => c.who === 'Aoife')!,
        'Ann Power',
      ),
    ).toBe('Needs you');
    expect(
      waitingWords(
        forAnn.find((c) => c.who === 'Ciarán')!,
        null,
      ),
    ).toBeNull();

    const forNiamh = list({ ...waiting, readers: { ...readers, viewerUserId: NIAMH } });
    expect(conversationsIn('needs-you', forNiamh).map((c) => c.who)).toEqual(['Sorcha']);

    // A home with no lead is everybody's.
    const nobodyLeads = homes.map((home) => ({ ...home, leadUserId: null }));
    expect(needingYou(list({ ...waiting, homes: nobodyLeads }))).toBe(2);
  });

  it('opens on "Needs you" when anything is waiting, and on "All" when nothing is', () => {
    const waiting = list({ messages: said, drafts: [{ applicationId: AOIFE, since: ago(29) }] });
    const quiet = list({ messages: said });
    expect(showFor(undefined, waiting)).toBe('needs-you');
    expect(showFor(undefined, quiet)).toBe('all');
    // The chip a person chose is kept, and anything else in the address is ignored.
    expect(showFor('all', waiting)).toBe('all');
    expect(showFor('needs-you', quiet)).toBe('needs-you');
    expect(showFor('everything', waiting)).toBe('needs-you');
  });
});
