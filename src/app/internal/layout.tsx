import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireStaff } from '@/server/auth/staff';
// A plain centred column, shared with the development pages: internal tools have no shell.
import styles from '../dev/outbox/outbox.module.css';

export const metadata: Metadata = {
  title: { default: 'Internal', template: '%s · Gaff internal' },
};
export const dynamic = 'force-dynamic';

/**
 * UX-TS-5: Gaff's internal pages, for Gaff's own team only (STAFF_EMAILS). Anyone else, signed
 * in or not, gets "not found". `/internal` is the one page, with its three lists (agencies to
 * confirm, reported listings, the funnels); Agencies (pilot set-up) and Funnels (every step)
 * open from it. Each page also calls requireStaff() itself, since a layout isn't run again when
 * moving between its pages.
 */
export default async function InternalLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return <main className={styles.main}>{children}</main>;
}
