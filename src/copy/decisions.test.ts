import { describe, expect, it } from 'vitest';
import { agoWords, decisionsCopy, meetsWords } from './decisions';

const now = new Date('2026-11-17T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('UX-DC-16: "Waiting for Mary · sent 2 hours ago"', () => {
  it('says how long ago, in words', () => {
    expect(decisionsCopy.owner.waiting.line('Mary', ago(125), now)).toBe(
      'Waiting for Mary · sent 2 hours ago',
    );
    expect(agoWords(ago(0), now)).toBe('just now');
    expect(agoWords(ago(1), now)).toBe('1 minute ago');
    expect(agoWords(ago(60 * 24 * 3), now)).toBe('3 days ago');
  });

  it('starts a sentence with a capital when Gaff has no name for the owner', () => {
    expect(decisionsCopy.owner.sent.text('the owner')).toBe(
      'The owner has a private link to approve or decline.',
    );
  });
});

describe('UX-DC-1, Q36: beside a person, only what was asked', () => {
  it('is a count of the criteria met, and never a recommendation', () => {
    expect(meetsWords({ met: 3, total: 4, answered: true })).toBe('Meets 3 of 4');
    expect(meetsWords({ met: 0, total: 4, answered: false })).toBe(
      'Hasn’t answered the questions yet',
    );
    expect(meetsWords({ met: 0, total: 0, answered: true })).toBe('No criteria set');
  });
});

describe('UX-DC-4: fewer ticked than places', () => {
  it('says how many places won’t be offered, and asks', () => {
    expect(decisionsCopy.whoViews.check.unoffered(3)).toBe(
      '3 places won’t be offered. Invite more?',
    );
    expect(decisionsCopy.whoViews.check.unoffered(1)).toBe(
      '1 place won’t be offered. Invite more?',
    );
  });
});
