import {
  type AddableContext,
  addableContexts,
  type PersonContext,
  switcherFor,
} from './context';

/** Who the account menu is for: their name, the contexts they have, and the one that's open. */
export interface AccountPerson {
  name: string;
  contexts: readonly PersonContext[];
  current: PersonContext | null;
}

/** What a row is, for its icon. */
export type AccountRowKind =
  | 'switch'
  | 'add-renting'
  | 'add-own-homes'
  | 'add-agency'
  | 'profile'
  | 'settings'
  | 'help'
  | 'sign-out';

/**
 * One row of the menu: a link (`href`), a switch to a context the person already has
 * (`switchTo`), a context to add (`add`), or Sign out, which has none of these.
 */
export interface AccountRow {
  /** Unique in the menu. */
  key: string;
  kind: AccountRowKind;
  label: string;
  href?: string;
  /** UX-AC-11: the key of the context this row switches to. */
  switchTo?: string;
  /** In a list of contexts: the one that's open now. */
  current?: boolean;
  /** UX-AC-13: the context this row adds, where adding it needs no screen of its own. */
  add?: Exclude<AddableContext, 'agency'>;
}

export interface AccountMenu {
  name: string;
  /** The context they are in, in words: the agency name, "My own homes" or "Renting". None yet: null. */
  context: string | null;
  rows: AccountRow[];
}

/** UX-AC-13: joining or setting up an agency starts at the step it needs: finding the agency. */
export const addAgencyHref = '/welcome?step=agency';

const addRows: Record<AddableContext, AccountRow> = {
  renting: { key: 'add-renting', kind: 'add-renting', label: 'Find a home to rent', add: 'renting' },
  own_homes: {
    key: 'add-own-homes',
    kind: 'add-own-homes',
    label: 'Let a home I own',
    add: 'own_homes',
  },
  agency: {
    key: 'add-agency',
    kind: 'add-agency',
    label: 'Join or set up an agency',
    href: addAgencyHref,
  },
};

/**
 * UX-NV-8, UX-AC-11 to UX-AC-13: the account menu holds, in this order: the person's name and
 * current context; the switcher, when they have more than one context; the contexts they can
 * still add; Profile; settings, where they let homes; Help; Sign out.
 *
 * Team is left out until its own package (WP-19) builds it.
 */
export function accountMenuFor(person: AccountPerson): AccountMenu {
  const { current } = person;
  const switcher = switcherFor(person.contexts, current);
  const rows: AccountRow[] = [];
  if (switcher.kind === 'toggle') {
    rows.push({ key: 'switch', kind: 'switch', label: switcher.label, switchTo: switcher.to });
  } else if (switcher.kind === 'list') {
    for (const context of switcher.contexts) {
      rows.push({
        key: `switch-${context.key}`,
        kind: 'switch',
        label: context.label,
        switchTo: context.key,
        current: context.current,
      });
    }
  }
  for (const add of addableContexts(person.contexts)) rows.push(addRows[add]);
  rows.push({ key: 'profile', kind: 'profile', label: 'Profile', href: '/profile' });
  if (current?.side === 'letting') {
    rows.push({
      key: 'settings',
      kind: 'settings',
      // UX-AC-4: a private landlord's organisation has no settings of its own: these are theirs.
      label: current.kind === 'agency' ? 'Agency settings' : 'Settings',
      href: '/settings',
    });
  }
  rows.push(
    { key: 'help', kind: 'help', label: 'Help', href: '/help' },
    { key: 'sign-out', kind: 'sign-out', label: 'Sign out' },
  );
  return { name: person.name, context: current?.label ?? null, rows };
}
