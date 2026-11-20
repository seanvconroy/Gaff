import { BadgeCheck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Avatar.module.css';
import { initialsOf } from './code';

/**
 * A person or an agency, as their initials in a circle (section 8, "Avatar and badge"). Never a
 * photo: a renter's profile has none, so nobody is judged by a face (product rule 3). It sits
 * beside the name, so screen readers skip it. `strong` is ink, for the agency whose page this is.
 */
export function Avatar({
  name,
  size = 'medium',
  tone = 'quiet',
}: {
  name: string;
  size?: 'small' | 'medium' | 'large';
  tone?: 'quiet' | 'strong';
}) {
  return (
    <span className={`${styles.avatar} ${styles[size]} ${styles[tone]}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

/**
 * A small mark beside a name: "Identity verified". Words with an icon, never colour alone.
 * `verified` is success green; `quiet` is for a plain fact such as "Admin".
 */
export function Badge({
  tone = 'verified',
  icon: Icon = BadgeCheck,
  children,
}: {
  tone?: 'verified' | 'quiet';
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={`${styles.badge} ${styles[`badge${tone === 'verified' ? 'Verified' : 'Quiet'}`]}`}
    >
      <Icon className={styles.badgeIcon} size={20} strokeWidth={1.75} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
