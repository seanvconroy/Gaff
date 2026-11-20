import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { reportReasons } from '@/domain/homes/report';
import { caseFacts } from '@/domain/trust/cases';
import { layOutGaffEmail } from './email-layout';
import { hiddenCopy, hiddenReasons } from './trust';
import {
  appealKeptEmail,
  caseFactWords,
  factsInWords,
  listingBackEmail,
  listingHeldEmail,
  listingHiddenEmail,
  reasonGrounds,
  reportOutcomeEmail,
} from './trust-emails';

const APP = 'https://app.gaff.test';
const LETTING = `${APP}/lettings/3f0c`;

const statement = {
  address: '12 Ranelagh Road',
  reason: 'wrong_details' as const,
  reasonWords: hiddenReasons.wrong_details,
  facts: ['reports', 'photos'] as const,
  decidedOn: 'Thursday 19 November',
  lettingUrl: LETTING,
};

/**
 * UX-TS-4, BA-9 (M96 to M98; DSA articles 16, 17 and 20): the emails about a reported listing.
 * New wording, listed for the solicitor. These tests pin every word: a change here is a
 * decision, not a side effect.
 */
describe('M97, M98: telling the lister, word for word', () => {
  it('M97: the email that says the rules took it off automatically, for a person to check', () => {
    const email = listingHeldEmail({ address: '12 Ranelagh Road', lettingUrl: LETTING });
    expect(email.subject).toBe('12 Ranelagh Road is off gaff.ie while we check a report');
    expect(email.button).toBe('Open the letting');
    expect(email.text).toBe(
      [
        'Hello,',
        '',
        'Visitors reported 12 Ranelagh Road as a possible scam, so Gaff’s rules took it off gaff.ie automatically while a person checks. Nobody has decided anything about it yet.',
        '',
        'While it’s off, it has no page and isn’t in search. Gaff isn’t answering its enquiries: they wait, and are answered when it’s back.',
        '',
        LETTING,
        '',
        'A person on Gaff’s team will look at it within four working hours. If it’s fine, it goes straight back on gaff.ie, and we’ll email you either way.',
        '',
        'Gaff',
      ].join('\n'),
    );
  });

  it('M98: the statement of reasons: what, why, the facts, what it rests on, who and when, and how to appeal', () => {
    const email = listingHiddenEmail(statement);
    expect(email.subject).toBe('12 Ranelagh Road is off gaff.ie for now');
    expect(email.button).toBe('Open the letting');
    expect(email.text).toBe(
      [
        'Hello,',
        '',
        'Gaff’s team has taken 12 Ranelagh Road off gaff.ie after a report: some of its details look wrong.',
        '',
        'What we relied on: the reports we received and the home’s photos. This rests on Gaff’s listing rules: a listing’s details must be accurate. A person on Gaff’s team decided this on Thursday 19 November.',
        '',
        'While it’s off, it has no page and isn’t in search. Gaff isn’t answering its enquiries: they wait, and are answered when it’s back.',
        '',
        'If you think we got it wrong, or once you’ve put right anything that needs it, press “Ask Gaff to look again” on the letting. You can ask once, within six months.',
        '',
        LETTING,
        '',
        'A different person on Gaff’s team will look within one working day of your asking, and email you.',
        '',
        'Gaff',
      ].join('\n'),
    );
  });

  it('UX-TS-4: the email that says it is back, word for word', () => {
    const email = listingBackEmail({ address: '12 Ranelagh Road', lettingUrl: LETTING });
    expect(email.subject).toBe('12 Ranelagh Road is back on gaff.ie');
    expect(email.button).toBe('Open the letting');
    expect(email.text).toBe(
      [
        'Hello,',
        '',
        'Gaff’s team has looked again at 12 Ranelagh Road, and it’s back on gaff.ie, with its page and its place in search.',
        '',
        'Gaff is answering its enquiries again, starting with anyone who enquired while it was off.',
        '',
        LETTING,
        '',
        'There’s nothing you need to do.',
        '',
        'Gaff',
      ].join('\n'),
    );
  });

  it('M98: the answer to an appeal that keeps it off, with its own statement and where to go next', () => {
    const email = appealKeptEmail({
      ...statement,
      reason: 'scam',
      reasonWords: hiddenReasons.scam,
    });
    expect(email.subject).toBe('12 Ranelagh Road stays off gaff.ie');
    expect(email.text).toBe(
      [
        'Hello,',
        '',
        'A different person on Gaff’s team has looked again at 12 Ranelagh Road, as you asked, and it stays off gaff.ie: it may not be a genuine listing.',
        '',
        'What we relied on: the reports we received and the home’s photos. This rests on Gaff’s listing rules: every home on gaff.ie must be a real home, offered by someone who may let it. A person on Gaff’s team decided this on Thursday 19 November.',
        '',
        'You can’t ask Gaff to look again a second time. You can take it to an out-of-court dispute settlement body certified under the EU Digital Services Act, or to the courts.',
        '',
        LETTING,
        '',
        'While it’s off, Gaff isn’t answering its enquiries. Nothing more happens unless you take it further.',
        '',
        'Gaff',
      ].join('\n'),
    );
  });

  it('M98: each reason’s ground, and each fact, word for word', () => {
    expect(reasonGrounds).toEqual({
      scam: 'Gaff’s listing rules: every home on gaff.ie must be a real home, offered by someone who may let it',
      wrong_details: 'Gaff’s listing rules: a listing’s details must be accurate',
      unfair:
        'the Equal Status Acts 2000 to 2018, and Gaff’s listing rules: a listing must be fair to everyone who may apply',
      something_else: 'Gaff’s listing rules',
    });
    expect(caseFactWords).toEqual({
      reports: 'the reports we received',
      photos: 'the home’s photos',
      description: 'the home’s description',
      rent: 'the rent asked',
      address: 'the home’s address',
      lister: 'the lister’s details on its page',
    });
    expect(Object.keys(caseFactWords)).toEqual([...caseFacts]);
    expect(factsInWords(['reports'])).toBe('the reports we received');
    expect(factsInWords(['reports', 'rent', 'address'])).toBe(
      'the reports we received, the rent asked and the home’s address',
    );
  });

  it('UX-TS-4: each of the four reasons, as the lister reads it, word for word', () => {
    expect(hiddenReasons).toEqual({
      scam: 'it may not be a genuine listing',
      wrong_details: 'some of its details look wrong',
      unfair: 'its wording about who can apply may not be fair to everyone',
      something_else: 'something about it needs a closer look',
    });
    expect(Object.keys(hiddenReasons).sort()).toEqual([...reportReasons].sort());
  });
});

describe('M96: telling a visitor who reported it, if they asked', () => {
  it('M96: the outcome, word for word, either way', () => {
    const hidden = reportOutcomeEmail({
      address: '12 Ranelagh Road',
      hidden: true,
      searchUrl: `${APP}/`,
    });
    expect(hidden.subject).toBe('What we decided about the listing you reported');
    expect(hidden.button).toBe('Search homes on Gaff');
    expect(hidden.text).toBe(
      [
        'Hello,',
        '',
        'A person on Gaff’s team looked at the listing for 12 Ranelagh Road that you reported, and took it off gaff.ie. Thank you for telling us.',
        '',
        `${APP}/`,
        '',
        'We’ve deleted your email address now, so you won’t hear from us again about it. There’s nothing more you need to do.',
        '',
        'Gaff',
      ].join('\n'),
    );
    expect(
      reportOutcomeEmail({ address: '12 Ranelagh Road', hidden: false, searchUrl: `${APP}/` }).text,
    ).toContain(
      'A person on Gaff’s team looked at the listing for 12 Ranelagh Road that you reported, and found it keeps to Gaff’s listing rules, so it stays on gaff.ie. Thank you for telling us.',
    );
  });
});

describe('UX-PP-10, rule 3: every one in the Gaff layout, naming no reporter and no protected ground', () => {
  const emails = [
    listingHeldEmail({ address: '12 Ranelagh Road', lettingUrl: LETTING }),
    ...reportReasons.flatMap((reason) => [
      listingHiddenEmail({ ...statement, reason, reasonWords: hiddenReasons[reason] }),
      appealKeptEmail({ ...statement, reason, reasonWords: hiddenReasons[reason] }),
    ]),
    listingBackEmail({ address: '12 Ranelagh Road', lettingUrl: LETTING }),
  ];

  it('UX-PP-10: each lister email goes in the Gaff layout with one button, and names no reporter', () => {
    for (const email of emails) {
      const laidOut = layOutGaffEmail({
        subject: email.subject,
        body: email.text,
        button: email.button,
        appUrl: APP,
      });
      expect(
        laidOut.html.match(/<a [^>]*href="https:\/\/app\.gaff\.test\/lettings\/3f0c"/g),
      ).toHaveLength(1);
      expect(email.text).not.toMatch(/!|reporter|who reported/i);
      expect(email.text.trimEnd().endsWith('Gaff')).toBe(true);
    }
  });

  it('Rule 3: no reason, fact or line the lister reads names a protected ground', () => {
    const words = [
      ...Object.values(hiddenReasons),
      ...Object.values(caseFactWords),
      ...reportReasons.map((reason) => hiddenCopy.task.lead(reason)),
      hiddenCopy.task.looking,
      hiddenCopy.task.held,
      hiddenCopy.task.final,
      hiddenCopy.page.meanwhile,
      hiddenCopy.page.fix,
      hiddenCopy.page.next,
      ...emails.map((email) => email.text.replace(/the Equal Status Acts 2000 to 2018, /g, '')),
    ];
    for (const line of words) expect(findProtectedGrounds(line), line).toEqual([]);
  });
});
