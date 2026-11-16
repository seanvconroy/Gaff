'use client';

import {
  CircleQuestionMark,
  House,
  LogOut,
  type LucideIcon,
  Search,
  Settings,
  UserRound,
} from 'lucide-react';
import type {
  AccountMenu as AccountMenuRows,
  AccountRowKey,
} from '@/domain/navigation/account-menu';
import styles from './AccountMenu.module.css';
import { Avatar } from './Avatar';
import { Menu, MenuItem } from './Menu';

const icons: Record<AccountRowKey, LucideIcon> = {
  'find-a-home': Search,
  'list-a-home': House,
  profile: UserRound,
  settings: Settings,
  help: CircleQuestionMark,
  'sign-out': LogOut,
};

/**
 * The account menu on the avatar, at the right-hand end of the navigation (UX-NV-8). It opens as
 * a sheet on a phone and beside the avatar on a desktop, and works by keyboard like any `Menu`.
 * What it holds, and in what order, is `accountMenuFor` (src/domain/navigation/account-menu.ts):
 * the person's name and context, then links, then Sign out, which is the one action.
 */
export function AccountMenu({
  menu,
  signOut,
}: {
  menu: AccountMenuRows;
  signOut: () => Promise<void>;
}) {
  return (
    <div className={styles.account}>
      <Menu
        label="Account"
        align="end"
        trigger={<Avatar name={menu.name} />}
        header={
          <p className={styles.who}>
            <span className={styles.name}>{menu.name}</span>
            <span className="visually-hidden"> · </span>
            <span className={styles.context}>{menu.context}</span>
          </p>
        }
      >
        {menu.rows.map((row) =>
          row.href ? (
            <MenuItem key={row.key} href={row.href} icon={icons[row.key]}>
              {row.label}
            </MenuItem>
          ) : (
            <MenuItem key={row.key} icon={icons[row.key]} onSelect={() => void signOut()}>
              {row.label}
            </MenuItem>
          ),
        )}
      </Menu>
    </div>
  );
}
