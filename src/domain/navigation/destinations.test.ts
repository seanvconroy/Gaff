import { describe, expect, it } from 'vitest';
import {
  currentDestination,
  destinationsFor,
  lettingDestinations,
  rentingDestinations,
} from './destinations';

const labels = (list: readonly { label: string }[]) => list.map((d) => d.label);

describe('UX-NV-1: the destinations for anyone running lettings', () => {
  it('are exactly four, in this order: Today, Lettings, Calendar, Inbox', () => {
    expect(labels(lettingDestinations)).toEqual(['Today', 'Lettings', 'Calendar', 'Inbox']);
    expect(lettingDestinations.map((d) => d.href)).toEqual([
      '/today',
      '/lettings',
      '/calendar',
      '/inbox',
    ]);
  });

  it('UX-NV-4: each label is one word, so it never wraps under its icon', () => {
    for (const { label } of [...lettingDestinations, ...rentingDestinations]) {
      expect(label).toMatch(/^\S+$/);
    }
  });

  it('UX-NV-1: Settings is not a destination: it is reached from the account menu', () => {
    expect(labels(lettingDestinations)).not.toContain('Settings');
    expect(currentDestination('letting', '/settings')).toBeNull();
    expect(currentDestination('letting', '/profile')).toBeNull();
  });
});

describe('UX-NV-2: Approvals, Questions and Needs attention are not destinations', () => {
  it('none of the three is in the bar', () => {
    for (const gone of ['Approvals', 'Questions', 'Needs attention']) {
      expect(labels(lettingDestinations)).not.toContain(gone);
    }
  });

  it('their pages belong to Inbox, which is marked as the page you are on', () => {
    for (const path of ['/inbox', '/approvals', '/questions', '/attention']) {
      expect(currentDestination('letting', path)?.label).toBe('Inbox');
    }
  });
});

describe('UX-NV-19: the renting side has three destinations in the same bar', () => {
  it('are Search, Saved and Enquiries, and Search is the public site’s first screen', () => {
    expect(labels(rentingDestinations)).toEqual(['Search', 'Saved', 'Enquiries']);
    expect(rentingDestinations.map((d) => d.href)).toEqual(['/', '/saved', '/enquiries']);
    expect(destinationsFor('renting')).toBe(rentingDestinations);
    expect(destinationsFor('letting')).toBe(lettingDestinations);
  });
});

describe('the page you are on', () => {
  it('is the destination whose pages hold the address', () => {
    expect(currentDestination('letting', '/today')?.label).toBe('Today');
    expect(currentDestination('letting', '/lettings')?.label).toBe('Lettings');
    expect(currentDestination('letting', '/lettings/3f0c/shortlist')?.label).toBe('Lettings');
    expect(currentDestination('letting', '/calendar')?.label).toBe('Calendar');
    expect(currentDestination('renting', '/saved')?.label).toBe('Saved');
    expect(currentDestination('renting', '/enquiries')?.label).toBe('Enquiries');
  });

  it('never matches on a prefix of another word', () => {
    expect(currentDestination('letting', '/todays')).toBeNull();
    expect(currentDestination('letting', '/lettings-old')).toBeNull();
  });

  it('Search is only the first screen itself, not every address under it', () => {
    expect(currentDestination('renting', '/')?.label).toBe('Search');
    expect(currentDestination('renting', '/profile')).toBeNull();
    expect(currentDestination('renting', '/help')).toBeNull();
  });
});
