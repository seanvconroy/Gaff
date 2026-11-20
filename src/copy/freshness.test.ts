import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { emailBlocks } from '@/domain/messages/email';
import { layOutGaffEmail } from './email-layout';
import { freshnessCopy, stillAvailableEmail } from './freshness';

const APP = 'https://app.gaff.test';
const LINK = `${APP}/still-available/3f0c0000-0000-4000-8000-000000000000/${'a'.repeat(43)}`;

/**
 * M49 (BA-13): the one email that asks a lister if a home is still available. NEW WORDING, for
 * the solicitor. These tests pin every word: a change here is a decision, not a side effect.
 */
describe('M49: asking the lister, word for word', () => {
  const email = stillAvailableEmail({
    address: '12 Ranelagh Road',
    link: LINK,
    stepsBackOn: 'Monday 23 November',
    lettingUrl: `${APP}/lettings/3f0c`,
  });

  it('M49: the email', () => {
    expect(email).toEqual({
      subject: 'Is 12 Ranelagh Road still available?',
      button: 'Still available',
      text: [
        'Hello,',
        '',
        '12 Ranelagh Road has been on Gaff for two weeks with no change. Renters want to know the homes they find are still there.',
        '',
        LINK,
        '',
        'If it’s still available, press Still available and it stays on gaff.ie. If we don’t hear by Monday 23 November, it comes off gaff.ie and search until you say it is, and its enquiries wait for you.',
        '',
        `If it’s been let, close the letting on Gaff: ${APP}/lettings/3f0c`,
        '',
        'Gaff',
      ].join('\n'),
    });
  });

  it('M49: one button, the link, which opens a page that asks before it changes anything', () => {
    const { html } = layOutGaffEmail({
      subject: email.subject,
      body: email.text,
      button: email.button,
      appUrl: APP,
    });
    expect(html.match(/data-email="button"/g)).toHaveLength(1);
    expect(emailBlocks(email.text)).toContainEqual({
      type: 'named-link',
      label: 'If it’s been let, close the letting on Gaff',
      url: `${APP}/lettings/3f0c`,
    });
  });

  it('rule 3, voice: nothing about a protected ground, no exclamation marks, and what happens next', () => {
    const words = JSON.stringify([freshnessCopy, email]);
    expect(findProtectedGrounds(words)).toEqual([]);
    expect(words).not.toContain('!');
    expect(freshnessCopy.page.next).toBe('We’ll ask again in two weeks if nothing changes.');
  });
});
