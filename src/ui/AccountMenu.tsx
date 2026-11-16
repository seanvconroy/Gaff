'use client';

import {
  ArrowLeftRight,
  Building2,
  Check,
  CircleQuestionMark,
  KeyRound,
  LogOut,
  type LucideIcon,
  Search,
  Settings,
  UserRound,
} from 'lucide-react';
import type {
  AccountMenu as AccountMenuRows,
  AccountRow,
  AccountRowKind,
} from '@/domain/navigation/account-menu';
import styles from './AccountMenu.module.css';
import { Avatar } from './Avatar';
import { initialsOf } from './code';
import { Menu, MenuItem } from './Menu';

const icons: Record<AccountRowKind, LucideIcon> = {
  switch: ArrowLeftRight,
  'add-renting': Search,
  'add-own-homes': KeyRound,
  'add-agency': Building2,
  profile: UserRound,
  settings: Settings,
  help: CircleQuestionMark,
  'sign-out': LogOut,
};

/** What the menu can do, beyond following a link. Each is a server action. */
export interface AccountActions {
  signOut: () => Promise<void>;
  /** UX-AC-11: switch to a context the person already has, by its key. */
  switchTo: (key: string) => Promise<void>;
  /** UX-AC-13: add "Renting" or "My own homes", and open it. */
  add: (context: 'renting' | 'own_homes') => Promise<void>;
}

/**
 * The account menu on the avatar, at the right-hand end of the navigation (UX-NV-8). It opens as
 * a sheet on a phone and beside the avatar on a desktop, and works by keyboard like any `Menu`.
 * What it holds, and in what order, is `accountMenuFor` (src/domain/navigation/account-menu.ts):
 * the person's name and context; the switcher, when they have more than one context (UX-AC-11);
 * the contexts they can add (UX-AC-13); then links; then Sign out.
 */
export function AccountMenu({ menu, actions }: { menu: AccountMenuRows; actions: AccountActions }) {
  const select = (row: AccountRow) => () => {
    if (row.current) return;
    if (row.switchTo) void actions.switchTo(row.switchTo);
    else if (row.add) void actions.add(row.add);
    else void actions.signOut();
  };
  return (
    <div className={styles.account}>
      <Menu
        label="Account"
        align="end"
        trigger={<Avatar name={menu.name} />}
        triggerLabel={`${initialsOf(menu.name)}, account`}
        header={
          <p className={styles.who}>
            <span className={styles.name}>{menu.name}</span>
            {menu.context ? (
              <>
                <span className="visually-hidden"> · </span>
                <span className={styles.context}>{menu.context}</span>
              </>
            ) : null}
          </p>
        }
      >
        {menu.rows.map((row) =>
          row.href ? (
            <MenuItem key={row.key} href={row.href} icon={icons[row.kind]}>
              {row.label}
            </MenuItem>
          ) : (
            <MenuItem
              key={row.key}
              // In a list of contexts, the one that's open carries a tick, and says so.
              icon={row.current ? Check : icons[row.kind]}
              onSelect={select(row)}
            >
              {row.label}
              {row.current ? <span className="visually-hidden"> (open now)</span> : null}
            </MenuItem>
          ),
        )}
      </Menu>
    </div>
  );
}
