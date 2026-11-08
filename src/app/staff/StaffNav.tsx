'use client';

import { Flag, Images, Mail, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '../(workspace)/workspace.module.css';

/**
 * Gaff staff's navigation, in the workspace's navy sidebar (a bottom bar on a phone). On the test
 * copy it adds the outbox and, for admins, the testers.
 */
export function StaffNav({ testCopy, admin }: { testCopy: boolean; admin: boolean }) {
  const pathname = usePathname();
  const items: Array<{ href: string; label: string; Icon: LucideIcon }> = [
    { href: '/staff/checks', label: 'Checks', Icon: ShieldCheck },
    { href: '/staff/listings', label: 'Listings', Icon: Images },
    { href: '/staff/review', label: 'Reports', Icon: Flag },
    ...(testCopy ? [{ href: '/dev/outbox', label: 'Outbox', Icon: Mail }] : []),
    ...(testCopy && admin ? [{ href: '/staff/testers', label: 'Testers', Icon: Users }] : []),
  ];
  return (
    <nav aria-label="Gaff staff" className={styles.nav} data-bottom-bar="">
      <ul className={styles.navList}>
        {items.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={styles.navLink}
              aria-current={pathname.startsWith(href) ? 'page' : undefined}
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
