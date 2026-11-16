import { type Context, findAHomeHref, listAHomeHref } from './context';

/** Who the account menu is for: their name, the side they're on, and who they let for. */
export interface AccountPerson {
  name: string;
  context: Context;
  organisation: { name: string; kind: 'agency' | 'landlord' } | null;
}

export type AccountRowKey =
  'find-a-home' | 'list-a-home' | 'profile' | 'settings' | 'help' | 'sign-out';

/** One row of the menu. Every row is a link, except Sign out, which is an action. */
export interface AccountRow {
  key: AccountRowKey;
  label: string;
  href?: string;
}

export interface AccountMenu {
  name: string;
  /** The context they're in, in words: the agency's name, "My own homes" or "Renting". */
  context: string;
  rows: AccountRow[];
}

/**
 * UX-NV-8: the account menu holds, in this order: the person's name and current context; the way
 * to the other side ("Find a home to rent" for someone who only lets, "List a home" for someone
 * who only rents); Profile; settings, where they let homes; Help; Sign out.
 *
 * Team is left out until its own package (WP-19) builds it. The switcher between contexts a
 * person already has (UX-AC-11) comes with work package WP-5: today a person has one context.
 */
export function accountMenuFor(person: AccountPerson): AccountMenu {
  const organisation = person.context === 'letting' ? person.organisation : null;
  const rows: AccountRow[] = [
    organisation
      ? { key: 'find-a-home', label: 'Find a home to rent', href: findAHomeHref }
      : { key: 'list-a-home', label: 'List a home', href: listAHomeHref },
    { key: 'profile', label: 'Profile', href: '/profile' },
  ];
  if (organisation) {
    rows.push({
      key: 'settings',
      label: organisation.kind === 'agency' ? 'Agency settings' : 'Settings',
      href: '/settings',
    });
  }
  rows.push({ key: 'help', label: 'Help', href: '/help' }, { key: 'sign-out', label: 'Sign out' });
  const context = !organisation
    ? 'Renting'
    : organisation.kind === 'agency'
      ? organisation.name
      : 'My own homes';
  return { name: person.name, context, rows };
}
