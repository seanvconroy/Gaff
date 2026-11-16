import { describe, expect, it } from 'vitest';
import { accountMenuFor } from './account-menu';
import { contextsFor, currentContext, type LastUsed } from './context';

const halcyon = { id: 'org-halcyon', name: 'Halcyon Lettings', kind: 'agency' } as const;
const rowan = { id: 'org-rowan', name: 'Rowan & Byrne', kind: 'agency' } as const;
const team = { id: 'org-team', name: 'Ó Briain Homes', kind: 'landlord' } as const;
const own = { id: 'org-own', name: 'Ann', kind: 'private_landlord' } as const;

function menuFor(
  name: string,
  person: Parameters<typeof contextsFor>[0],
  last: LastUsed = { side: null, organisationId: null },
) {
  const contexts = contextsFor(person);
  return accountMenuFor({ name, contexts, current: currentContext(contexts, last) });
}
const labels = (menu: ReturnType<typeof accountMenuFor>) => menu.rows.map((row) => row.label);

describe('UX-NV-8: what the account menu holds, and in what order', () => {
  it('starts with the person’s name and the context they are in', () => {
    expect(menuFor('Ann Power', { organisations: [halcyon], renting: false })).toMatchObject({
      name: 'Ann Power',
      context: 'Halcyon Lettings',
    });
    expect(menuFor('Ann Power', { organisations: [own], renting: false }).context).toBe(
      'My own homes',
    );
    expect(menuFor('Aoife Byrne', { organisations: [], renting: true }).context).toBe('Renting');
  });

  it('someone still in first run has no context to name', () => {
    expect(menuFor('Aoife Byrne', { organisations: [], renting: false }).context).toBeNull();
  });

  it('an agency: the roles to add, Profile, Agency settings, Help, then Sign out', () => {
    const menu = menuFor('Ann Power', { organisations: [halcyon], renting: false });
    expect(labels(menu)).toEqual([
      'Find a home to rent',
      'Let a home I own',
      'Profile',
      'Agency settings',
      'Help',
      'Sign out',
    ]);
  });

  it('UX-AC-4: a private landlord’s settings are theirs, not an agency’s or an organisation’s', () => {
    const menu = menuFor('Ann Power', { organisations: [own], renting: false });
    expect(labels(menu)).toEqual([
      'Find a home to rent',
      'Join or set up an agency',
      'Profile',
      'Settings',
      'Help',
      'Sign out',
    ]);
    expect(labels(menuFor('Seán Ó Briain', { organisations: [team], renting: false }))).toContain(
      'Settings',
    );
  });

  it('a person who only rents sees the ways to let, and no settings', () => {
    const menu = menuFor('Aoife Byrne', { organisations: [], renting: true });
    expect(labels(menu)).toEqual([
      'Let a home I own',
      'Join or set up an agency',
      'Profile',
      'Help',
      'Sign out',
    ]);
  });

  it('Team is a later package: it is left out rather than a link to nowhere', () => {
    const menu = menuFor('Ann Power', { organisations: [halcyon], renting: false });
    expect(labels(menu)).not.toContain('Team');
  });

  it('every row leads somewhere or does something, and Sign out is always last', () => {
    for (const person of [
      { organisations: [halcyon], renting: false },
      { organisations: [], renting: true },
      { organisations: [halcyon, own], renting: true },
    ]) {
      const { rows } = menuFor('Ann Power', person);
      expect(rows.at(-1)).toEqual({ key: 'sign-out', kind: 'sign-out', label: 'Sign out' });
      for (const row of rows.slice(0, -1)) {
        expect(row.href ?? row.switchTo ?? row.add, row.label).toBeTruthy();
      }
      expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    }
  });
});

describe('UX-AC-11, UX-AC-12: switching, at the top of the account menu', () => {
  it('UX-AC-12: a person with one context sees no switcher', () => {
    for (const person of [
      { organisations: [halcyon], renting: false },
      { organisations: [own], renting: false },
      { organisations: [], renting: true },
    ]) {
      const { rows } = menuFor('Ann Power', person);
      expect(rows.filter((row) => row.kind === 'switch')).toEqual([]);
    }
  });

  it('with just two, the first row reads "Switch to renting" or "Switch to letting"', () => {
    const person = { organisations: [halcyon], renting: true };
    expect(menuFor('Ann Power', person).rows[0]).toEqual({
      key: 'switch',
      kind: 'switch',
      label: 'Switch to renting',
      switchTo: 'renting',
    });
    expect(menuFor('Ann Power', person, { side: 'renting', organisationId: null }).rows[0]).toEqual(
      {
        key: 'switch',
        kind: 'switch',
        label: 'Switch to letting',
        switchTo: 'org-halcyon',
      },
    );
  });

  it('with more, each is listed first: every agency by name, My own homes and Renting', () => {
    const menu = menuFor(
      'Ann Power',
      { organisations: [halcyon, rowan, own], renting: true },
      { side: 'letting', organisationId: 'org-rowan' },
    );
    expect(menu.context).toBe('Rowan & Byrne');
    expect(menu.rows.slice(0, 4)).toEqual([
      {
        key: 'switch-org-halcyon',
        kind: 'switch',
        label: 'Halcyon Lettings',
        switchTo: 'org-halcyon',
        current: false,
      },
      {
        key: 'switch-org-rowan',
        kind: 'switch',
        label: 'Rowan & Byrne',
        switchTo: 'org-rowan',
        current: true,
      },
      {
        key: 'switch-org-own',
        kind: 'switch',
        label: 'My own homes',
        switchTo: 'org-own',
        current: false,
      },
      {
        key: 'switch-renting',
        kind: 'switch',
        label: 'Renting',
        switchTo: 'renting',
        current: false,
      },
    ]);
    // Nothing is left to add, so Profile comes next.
    expect(menu.rows[4]?.label).toBe('Profile');
  });
});

describe('UX-AC-13, UX-AC-8: adding a context from the account menu', () => {
  it('"Find a home to rent" and "Let a home I own" need no screen: one tap adds them', () => {
    const menu = menuFor('Ann Power', { organisations: [halcyon], renting: false });
    expect(menu.rows[0]).toMatchObject({ label: 'Find a home to rent', add: 'renting' });
    expect(menu.rows[1]).toMatchObject({ label: 'Let a home I own', add: 'own_homes' });
  });

  it('"Join or set up an agency" starts at the step it needs: finding the agency', () => {
    const menu = menuFor('Aoife Byrne', { organisations: [], renting: true });
    expect(menu.rows[1]).toMatchObject({
      label: 'Join or set up an agency',
      href: '/welcome?step=agency',
    });
  });

  it('settings follow the context that is open, not the ones a person merely has', () => {
    const person = { organisations: [halcyon], renting: true };
    expect(labels(menuFor('Ann Power', person))).toContain('Agency settings');
    const renting = menuFor('Ann Power', person, { side: 'renting', organisationId: null });
    expect(labels(renting)).not.toContain('Agency settings');
  });
});
