'use client';

import {
  House,
  Inbox,
  type LucideIcon,
  MessageCircleQuestionMark,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './workspace.module.css';

const items: Array<{ href: string; label: string; Icon: LucideIcon; current: RegExp }> = [
  { href: '/', label: 'Lettings', Icon: House, current: /^\/($|lettings(\/|$))/ },
  { href: '/approvals', label: 'Approvals', Icon: Sparkles, current: /^\/approvals(\/|$)/ },
  {
    href: '/questions',
    label: 'Questions',
    Icon: MessageCircleQuestionMark,
    current: /^\/questions(\/|$)/,
  },
  { href: '/attention', label: 'Needs attention', Icon: Inbox, current: /^\/attention(\/|$)/ },
  { href: '/settings', label: 'Settings', Icon: SlidersHorizontal, current: /^\/settings(\/|$)/ },
];

/**
 * The workspace navigation: a navy sidebar on a laptop and a bottom bar on a phone (A4), one
 * element either way. The current page is marked for screen readers as well as by colour.
 */
export function WorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className={styles.nav} data-bottom-bar="">
      <ul className={styles.navList}>
        {items.map(({ href, label, Icon, current }) => (
          <li key={href}>
            <Link
              href={href}
              className={styles.navLink}
              aria-current={current.test(pathname) ? 'page' : undefined}
            >
              <Icon className={styles.navIcon} size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
