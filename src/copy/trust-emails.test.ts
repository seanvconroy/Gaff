import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { reportReasons } from '@/domain/homes/report';
import { listingBackEmail, listingHiddenEmail } from './account-emails';
import { layOutGaffEmail } from './email-layout';
import { hiddenCopy, hiddenReasons } from './trust';

const APP = 'https://app.gaff.test';
const LETTING = `${APP}/lettings/3f0c`;

/**
 * UX-TS-4: the two emails to a lister when Gaff's team hides a home after a report, and when
 * they put it back. New wording, listed for the solicitor (DSA: "reasons when one is taken
 * down"). These tests pin every word: a change here is a decision, not a side effect.
 */
describe('UX-TS-4: telling the lister a home is off gaff.ie, and back', () => {
  it('UX-TS-4: the email that says a home was taken off, and why, word for word', () => {
    const email = listingHiddenEmail({
      address: '12 Ranelagh Road',
      reason: hiddenReasons.wrong_details,
      lettingUrl: LETTING,
    });
    expect(email.subject).toBe('12 Ranelagh Road is off gaff.ie for now');
    expect(email.button).toBe('Open the letting');
    expect(email.text).toBe(
      [
        'Hello,',
        '',
        'Gaff’s team has taken 12 Ranelagh Road off gaff.ie after a report: some of its details look wrong.',
        '',
        'While it’s off, it has no page and isn’t in search. Gaff isn’t answering its enquiries: they wait, and are answered when it’s back.',
        '',
        'Put right anything that needs it in the home’s details, then press “Ask Gaff to look again” on the letting.',
        '',
        LETTING,
        '',
        'We’ll look within one working day and email you when it’s back.',
        '',
        'Gaff',
      ].join('\n'),
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

  it('UX-PP-10: each goes in the Gaff layout with one button, and names no reporter', () => {
    const emails = [
      ...reportReasons.map((reason) =>
        listingHiddenEmail({
          address: '12 Ranelagh Road',
          reason: hiddenReasons[reason],
          lettingUrl: LETTING,
        }),
      ),
      listingBackEmail({ address: '12 Ranelagh Road', lettingUrl: LETTING }),
    ];
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

  it('Rule 3: no reason or line the lister reads names a protected ground', () => {
    const words = [
      ...Object.values(hiddenReasons),
      ...reportReasons.map((reason) => hiddenCopy.task.lead(reason)),
      hiddenCopy.task.looking,
      hiddenCopy.page.meanwhile,
      hiddenCopy.page.fix,
      hiddenCopy.page.next,
    ];
    for (const line of words) expect(findProtectedGrounds(line), line).toEqual([]);
  });
});
