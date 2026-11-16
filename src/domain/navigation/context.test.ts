import { describe, expect, it } from 'vitest';
import {
  addableContexts,
  contextsFor,
  currentContext,
  firstScreenRedirect,
  homeFor,
  lettingContext,
  listAHomeHref,
  listAHomeSignedOutHref,
  lookAroundHref,
  switcherFor,
} from './context';

const halcyon = { id: 'org-halcyon', name: 'Halcyon Lettings', kind: 'agency' } as const;
const rowan = { id: 'org-rowan', name: 'Rowan & Byrne', kind: 'agency' } as const;
const team = { id: 'org-team', name: 'Ó Briain Homes', kind: 'landlord' } as const;
const own = { id: 'org-own', name: 'Ann', kind: 'private_landlord' } as const;
const nothingYet = { side: null, organisationId: null };

describe('UX-AC-11: the contexts a person has', () => {
  it('UX-AC-2: each organisation they belong to, and Renting once they have said so', () => {
    const contexts = contextsFor({ organisations: [halcyon, own], renting: true });
    expect(contexts.map((context) => [context.key, context.side, context.label])).toEqual([
      ['org-halcyon', 'letting', 'Halcyon Lettings'],
      ['org-own', 'letting', 'My own homes'],
      ['renting', 'renting', 'Renting'],
    ]);
  });

  it('UX-AC-4: a private landlord’s silent organisation has no name: it is "My own homes"', () => {
    const [context] = contextsFor({ organisations: [own], renting: false });
    expect(context).toMatchObject({ label: 'My own homes', kind: 'private_landlord' });
  });

  it('an agency and a landlord’s team go by name, in the order joined, with own homes after', () => {
    const contexts = contextsFor({ organisations: [own, team, halcyon], renting: false });
    expect(contexts.map((context) => context.label)).toEqual([
      'Ó Briain Homes',
      'Halcyon Lettings',
      'My own homes',
    ]);
  });

  it('someone who has only signed in has none', () => {
    expect(contextsFor({ organisations: [], renting: false })).toEqual([]);
  });
});

describe('UX-AC-11: Gaff reopens the context they used last', () => {
  const contexts = contextsFor({ organisations: [halcyon, rowan, own], renting: true });

  it('the side they used last, and on the letting side the organisation they used last', () => {
    expect(currentContext(contexts, { side: 'renting', organisationId: 'org-rowan' })?.key).toBe(
      'renting',
    );
    expect(currentContext(contexts, { side: 'letting', organisationId: 'org-rowan' })?.key).toBe(
      'org-rowan',
    );
  });

  it('with nothing remembered, the first one: an organisation before Renting', () => {
    expect(currentContext(contexts, nothingYet)?.key).toBe('org-halcyon');
    const renter = contextsFor({ organisations: [], renting: true });
    expect(currentContext(renter, nothingYet)?.key).toBe('renting');
  });

  it('a context they no longer have is never reopened', () => {
    const left = contextsFor({ organisations: [own], renting: false });
    expect(currentContext(left, { side: 'letting', organisationId: 'org-halcyon' })?.key).toBe(
      'org-own',
    );
    expect(currentContext(left, { side: 'renting', organisationId: null })?.key).toBe('org-own');
  });

  it('with no context there is none to reopen', () => {
    expect(currentContext([], { side: 'renting', organisationId: null })).toBeNull();
  });

  it('a workspace page works for the organisation they let for last, whatever side is open', () => {
    expect(lettingContext(contexts, { side: 'renting', organisationId: 'org-rowan' })?.key).toBe(
      'org-rowan',
    );
    expect(lettingContext(contexts, { side: 'renting', organisationId: null })?.key).toBe(
      'org-halcyon',
    );
    const renter = contextsFor({ organisations: [], renting: true });
    expect(lettingContext(renter, nothingYet)).toBeNull();
  });
});

describe('UX-AC-11, UX-AC-12: the switcher', () => {
  it('UX-AC-12: a person with one context sees no switcher', () => {
    for (const person of [
      { organisations: [halcyon], renting: false },
      { organisations: [], renting: true },
      { organisations: [], renting: false },
    ]) {
      const contexts = contextsFor(person);
      expect(switcherFor(contexts, currentContext(contexts, nothingYet))).toEqual({ kind: 'none' });
    }
  });

  it('with just letting and renting, it reads "Switch to renting" or "Switch to letting"', () => {
    const contexts = contextsFor({ organisations: [halcyon], renting: true });
    const letting = contexts[0]!;
    const renting = contexts[1]!;
    expect(switcherFor(contexts, letting)).toEqual({
      kind: 'toggle',
      to: 'renting',
      label: 'Switch to renting',
    });
    expect(switcherFor(contexts, renting)).toEqual({
      kind: 'toggle',
      to: 'org-halcyon',
      label: 'Switch to letting',
    });
  });

  it('two places to let are told apart by name, not as "letting"', () => {
    const contexts = contextsFor({ organisations: [halcyon, own], renting: false });
    expect(switcherFor(contexts, contexts[0]!)).toEqual({
      kind: 'list',
      contexts: [
        { key: 'org-halcyon', label: 'Halcyon Lettings', current: true },
        { key: 'org-own', label: 'My own homes', current: false },
      ],
    });
  });

  it('with more than two, each is listed: every agency by name, My own homes and Renting', () => {
    const contexts = contextsFor({ organisations: [halcyon, rowan, own], renting: true });
    const switcher = switcherFor(contexts, contexts[3]!);
    expect(switcher).toEqual({
      kind: 'list',
      contexts: [
        { key: 'org-halcyon', label: 'Halcyon Lettings', current: false },
        { key: 'org-rowan', label: 'Rowan & Byrne', current: false },
        { key: 'org-own', label: 'My own homes', current: false },
        { key: 'renting', label: 'Renting', current: true },
      ],
    });
  });
});

describe('UX-AC-13, UX-AC-8: the contexts a person can still add', () => {
  it('whatever they chose at first run, the other roles are one tap away', () => {
    expect(addableContexts(contextsFor({ organisations: [], renting: true }))).toEqual([
      'own_homes',
      'agency',
    ]);
    expect(addableContexts(contextsFor({ organisations: [own], renting: false }))).toEqual([
      'renting',
      'agency',
    ]);
    expect(addableContexts(contextsFor({ organisations: [halcyon], renting: false }))).toEqual([
      'renting',
      'own_homes',
    ]);
  });

  it('nothing is offered twice', () => {
    expect(addableContexts(contextsFor({ organisations: [halcyon, own], renting: true }))).toEqual(
      [],
    );
  });
});

describe('UX-NV-19: where each side opens', () => {
  it('letting opens on Today, and renting on Search, the public site’s first screen', () => {
    expect(homeFor('letting')).toBe('/today');
    expect(homeFor('renting')).toBe('/');
  });
});

describe('the public site’s first screen, which is also where sign-in lands', () => {
  it('UX-HM-1: someone letting is sent on to Today', () => {
    expect(firstScreenRedirect({ side: 'letting' }, {})).toBe('/today');
  });

  it('UX-NV-19, UX-AC-6: someone renting stays: this screen is Search', () => {
    expect(firstScreenRedirect({ side: 'renting' }, {})).toBeNull();
  });

  it('UX-NV-20: a signed-out visitor stays on the public site', () => {
    expect(firstScreenRedirect(null, {})).toBeNull();
    expect(firstScreenRedirect(null, { rent: '1' })).toBeNull();
  });

  it('UX-SI-8: someone signed in with no context yet goes to first run', () => {
    expect(firstScreenRedirect({ side: null }, {})).toBe('/welcome');
  });

  it('UX-AC-10: they can leave first run to look around, and are asked again next time', () => {
    expect(lookAroundHref).toBe('/?rent=1');
    expect(firstScreenRedirect({ side: null }, { rent: '1' })).toBeNull();
    expect(firstScreenRedirect({ side: null }, { rent: ['1', '1'] })).toBe('/welcome');
    expect(firstScreenRedirect({ side: null }, { rent: 'no' })).toBe('/welcome');
    // It is only a way out of first run: someone letting still opens on Today.
    expect(firstScreenRedirect({ side: 'letting' }, { rent: '1' })).toBe('/today');
  });

  it('UX-NV-8, UX-NV-20: "List a home" leads to adding a letting, through sign-in if need be', () => {
    expect(listAHomeHref).toBe('/lettings/new');
    expect(listAHomeSignedOutHref).toBe('/sign-in?next=%2Flettings%2Fnew');
  });
});
