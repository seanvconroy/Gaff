import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { staffPasskeyCopy } from '@/copy/sign-in';
import { currentUser } from '@/server/auth/member';
import { staffFrom } from '@/server/auth/staff';
import styles from '../sign-in.module.css';
import { StaffPasskey } from './StaffPasskey';

export const metadata: Metadata = { title: staffPasskeyCopy.title };
export const dynamic = 'force-dynamic';

/**
 * BA-8 (M5): where /internal sends one of Gaff's team, in production, whose session didn't
 * begin with a passkey in the last 8 hours. Anyone else gets "not found", as /internal does.
 */
export default async function StaffPasskeyPage() {
  if (!staffFrom(await currentUser())) notFound();
  return (
    <div className={styles.screen}>
      <div className={styles.title}>
        <h1 className="type-display-mobile">{staffPasskeyCopy.title}</h1>
        <p className={styles.lead}>{staffPasskeyCopy.lead}</p>
      </div>
      <StaffPasskey returnTo="/sign-in/return?method=passkey&next=%2Finternal" />
    </div>
  );
}
