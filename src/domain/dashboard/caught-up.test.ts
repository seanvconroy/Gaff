import { describe, expect, it } from 'vitest';
import { suggestedAction, suggestionsBuilt, type SuggestionKind } from './caught-up';

const everything: SuggestionKind[] = [
  'finish_setup',
  'add_letting',
  'invite_colleague',
  'add_viewing_times',
];
const live = (id: string, viewingTimesAhead = 2) => ({
  id,
  addressLine1: id === 'a' ? '12 Ranelagh Road' : '9 Canal View',
  status: 'live',
  viewingTimesAhead,
});
const base = {
  setupUnfinished: false,
  organisationKind: 'agency' as const,
  members: 3,
  lettings: [live('a')],
};

describe('UX-HM-7: all caught up offers one next most valuable action, in a fixed order', () => {
  it('finishing setup comes first', () => {
    expect(
      suggestedAction({ ...base, setupUnfinished: true, members: 1, lettings: [] }, everything),
    ).toEqual({ kind: 'finish_setup' });
  });

  it('then adding a letting, if none is live', () => {
    expect(suggestedAction({ ...base, members: 1, lettings: [] }, everything)).toEqual({
      kind: 'add_letting',
    });
    const closed = [{ ...live('a'), status: 'let' }];
    expect(suggestedAction({ ...base, lettings: closed }, everything)).toEqual({
      kind: 'add_letting',
    });
  });

  it('then inviting a colleague, for an agency whose only member they are', () => {
    expect(suggestedAction({ ...base, members: 1 }, everything)).toEqual({
      kind: 'invite_colleague',
    });
    // A private landlord and a landlord's team aren't asked to invite anyone.
    for (const organisationKind of ['private_landlord', 'landlord'] as const) {
      expect(suggestedAction({ ...base, organisationKind, members: 1 }, everything)).toBeNull();
    }
  });

  it('then adding viewing times for a live home that has none', () => {
    expect(suggestedAction({ ...base, lettings: [live('a'), live('b', 0)] }, everything)).toEqual({
      kind: 'add_viewing_times',
      lettingId: 'b',
      address: '9 Canal View',
    });
  });

  it('otherwise nothing', () => {
    expect(suggestedAction(base, everything)).toBeNull();
  });

  it('is never more than one', () => {
    const suggestion = suggestedAction(
      { ...base, setupUnfinished: true, members: 1, lettings: [live('a', 0)] },
      everything,
    );
    expect(suggestion).toEqual({ kind: 'finish_setup' });
  });
});

describe('UX-HM-7: only actions that exist are offered, each in its place in the order', () => {
  it('today that is adding a letting and adding viewing times', () => {
    expect(suggestionsBuilt).toEqual(['add_letting', 'add_viewing_times']);
  });

  it('skips setup (WP-27) and inviting (WP-19) until they are built, and offers the next', () => {
    expect(suggestedAction({ ...base, setupUnfinished: true, members: 1, lettings: [] })).toEqual({
      kind: 'add_letting',
    });
    expect(suggestedAction({ ...base, members: 1, lettings: [live('a', 0)] })).toEqual({
      kind: 'add_viewing_times',
      lettingId: 'a',
      address: '12 Ranelagh Road',
    });
    expect(suggestedAction({ ...base, members: 1 })).toBeNull();
  });
});
