import { describe, expect, it } from 'vitest';
import { accountMenuFor } from './account-menu';

const agency = { name: 'Halcyon Lettings', kind: 'agency' } as const;
const landlord = { name: 'Ann Power', kind: 'landlord' } as const;
const labels = (menu: ReturnType<typeof accountMenuFor>) => menu.rows.map((row) => row.label);

describe('UX-NV-8: what the account menu holds, and in what order', () => {
  it('starts with the person’s name and the context they are in', () => {
    expect(
      accountMenuFor({ name: 'Ann Power', context: 'letting', organisation: agency }),
    ).toMatchObject({ name: 'Ann Power', context: 'Halcyon Lettings' });
    expect(
      accountMenuFor({ name: 'Ann Power', context: 'letting', organisation: landlord }).context,
    ).toBe('My own homes');
    expect(
      accountMenuFor({ name: 'Aoife Byrne', context: 'renting', organisation: null }).context,
    ).toBe('Renting');
  });

  it('an agency: the way to the other side, Profile, Agency settings, Help, then Sign out', () => {
    const menu = accountMenuFor({ name: 'Ann Power', context: 'letting', organisation: agency });
    expect(labels(menu)).toEqual([
      'Find a home to rent',
      'Profile',
      'Agency settings',
      'Help',
      'Sign out',
    ]);
  });

  it('a private landlord has settings too, and they are not called an agency’s', () => {
    const menu = accountMenuFor({ name: 'Ann Power', context: 'letting', organisation: landlord });
    expect(labels(menu)).toEqual([
      'Find a home to rent',
      'Profile',
      'Settings',
      'Help',
      'Sign out',
    ]);
  });

  it('a person who only rents sees "List a home", and no settings', () => {
    const menu = accountMenuFor({ name: 'Aoife Byrne', context: 'renting', organisation: null });
    expect(labels(menu)).toEqual(['List a home', 'Profile', 'Help', 'Sign out']);
  });

  it('Team is a later package: it is left out rather than a link to nowhere', () => {
    const menu = accountMenuFor({ name: 'Ann Power', context: 'letting', organisation: agency });
    expect(labels(menu)).not.toContain('Team');
  });

  it('every row but Sign out leads somewhere, and Sign out is always last', () => {
    for (const person of [
      { name: 'Ann Power', context: 'letting', organisation: agency },
      { name: 'Aoife Byrne', context: 'renting', organisation: null },
    ] as const) {
      const { rows } = accountMenuFor(person);
      expect(rows.at(-1)).toEqual({ key: 'sign-out', label: 'Sign out' });
      for (const row of rows.slice(0, -1)) expect(row.href).toMatch(/^\//);
    }
  });

  it('"Find a home to rent" opens the public site, and "List a home" adding a letting', () => {
    const letting = accountMenuFor({ name: 'Ann Power', context: 'letting', organisation: agency });
    expect(letting.rows[0]).toMatchObject({ key: 'find-a-home', href: '/?rent=1' });
    const renting = accountMenuFor({ name: 'Aoife Byrne', context: 'renting', organisation: null });
    expect(renting.rows[0]).toMatchObject({ key: 'list-a-home', href: '/lettings/new' });
  });
});
