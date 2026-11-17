import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { emailBlocks } from '@/domain/messages/email';
import { layOutGaffEmail } from './email-layout';
import { confirmSearchEmail, savedCopy, searchAlertEmail, searchWords } from './saved';

const APP = 'https://gaff.ie';
const NOW = new Date('2026-11-17T12:00:00Z');
const TOKEN = 'a'.repeat(43);

const homes = [
  {
    address: '4 Harbour Road, Greystones, Co. Wicklow',
    rent: '€1,900 a month',
    url: `${APP}/homes/0a1b2c3d4e5f`,
  },
  {
    address: '9 Burnaby Park, Greystones, Co. Wicklow',
    rent: '€1,950 a month',
    url: `${APP}/homes/1a1b2c3d4e5f`,
  },
];

const alert = (count: 1 | 2) =>
  searchAlertEmail({
    homes: homes.slice(0, count),
    searches: ['Greystones, Co. Wicklow · 2 bedrooms · Up to €2,000 a month'],
    searchUrl: `${APP}/?where=greystones&beds=2&max=2000`,
    stopUrl: `${APP}/alerts/${TOKEN}/stop`,
  });

/**
 * UX-SR-10: the words of the two new emails, pinned. NEW WORDING: listed for the solicitor in
 * WP-23's report. If a test here fails, the wording has changed: agree it before updating.
 */
describe('UX-SR-10: the saved-search emails say exactly this', () => {
  it('UX-SR-10: a saved search in words is its chips, as search shows them', () => {
    expect(searchWords({ where: 'greystones', beds: 2, maxRent: 2000, pets: false }, NOW)).toBe(
      'Greystones, Co. Wicklow · 2 bedrooms · Up to €2,000 a month · No pets',
    );
  });

  it('UX-SR-10: the one email that confirms the address', () => {
    const email = confirmSearchEmail({
      search: 'Greystones, Co. Wicklow · 2 bedrooms',
      confirmUrl: `${APP}/alerts/${TOKEN}`,
    });
    expect(email).toEqual({
      subject: 'Confirm your search on Gaff',
      button: 'Confirm my search',
      text: [
        'Hello,',
        '',
        'You asked Gaff to tell you when a home comes up: Greystones, Co. Wicklow · 2 bedrooms.',
        '',
        `${APP}/alerts/${TOKEN}`,
        '',
        'Once you confirm, we’ll email you when a new home fits, once a day at most. If you didn’t ask for this, there’s nothing to do: the search is dropped tomorrow.',
        '',
        'Gaff',
      ].join('\n'),
    });
  });

  it('UX-SR-10: the alert, for one home', () => {
    expect(alert(1)).toEqual({
      subject: 'A new home fits your search: 4 Harbour Road, Greystones, Co. Wicklow',
      button: 'See homes that fit',
      text: [
        'Hello,',
        '',
        'A new home on Gaff fits what you asked for: Greystones, Co. Wicklow · 2 bedrooms · Up to €2,000 a month.',
        '',
        `4 Harbour Road, Greystones, Co. Wicklow, €1,900 a month: ${APP}/homes/0a1b2c3d4e5f`,
        '',
        `${APP}/?where=greystones&beds=2&max=2000`,
        '',
        'You can ask to view it on its page, and you’ll hear back either way. We’ll email you again when another home fits, once a day at most.',
        '',
        `Stop these: ${APP}/alerts/${TOKEN}/stop`,
        '',
        'Gaff',
      ].join('\n'),
    });
  });

  it('UX-SR-10: the alert, for several homes and several searches', () => {
    const email = searchAlertEmail({
      homes,
      searches: ['Greystones, Co. Wicklow', 'Bray, Co. Wicklow'],
      searchUrl: `${APP}/?where=greystones`,
      stopUrl: `${APP}/alerts/${TOKEN}/stop`,
    });
    expect(email.subject).toBe('2 new homes fit your search');
    expect(email.text).toContain('2 new homes on Gaff fit what you asked for in your searches.');
    expect(email.text).toContain(
      'You can ask to view any of them on its page, and you’ll hear back either way.',
    );
  });

  it('UX-SR-10: every alert has "Stop these", which is a link, and one button', () => {
    for (const count of [1, 2] as const) {
      const email = alert(count);
      const blocks = emailBlocks(email.text);
      expect(blocks).toContainEqual({
        type: 'named-link',
        label: 'Stop these',
        url: `${APP}/alerts/${TOKEN}/stop`,
      });
      // Each home is a link named by its address and rent.
      expect(blocks.filter((block) => block.type === 'named-link')).toHaveLength(count + 1);
      const { html } = layOutGaffEmail({
        subject: email.subject,
        body: email.text,
        button: email.button,
        appUrl: APP,
      });
      expect(html.match(/data-email="button"/g)).toHaveLength(1);
      expect(html).toContain('>Stop these</a>');
    }
  });

  it('rule 3: nothing in these words is about a protected ground, or recommends anyone', () => {
    const words = JSON.stringify([
      savedCopy,
      alert(2),
      confirmSearchEmail({ search: '', confirmUrl: APP }),
    ]);
    expect(findProtectedGrounds(words)).toEqual([]);
    for (const word of ['suits', 'ideal for', 'perfect for', 'hurry', '!']) {
      expect(words.toLowerCase()).not.toContain(word);
    }
  });
});
