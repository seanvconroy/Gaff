import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { whoHasMyDetails } from '@/server/renters/homes';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../renter.module.css';
import { requireRenter } from '../renter';
import { deleteAccountAction } from './actions';

export const metadata: Metadata = { title: 'Your account' };

/** M13: download everything, or delete the account, and what happens to letters' copies. */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string; letter?: string }>;
}) {
  const { user } = await requireRenter();
  const { confirm, letter } = await searchParams;
  const letters = (await whoHasMyDetails(user.id)).filter((l) => !l.deleted);
  return (
    <Stack gap={8}>
      <PageHeader title="Your account" lead={`Signed in as ${user.email}`} />

      <section aria-labelledby="sign-in-heading" className={styles.section}>
        <h2 id="sign-in-heading" className="type-heading">
          How you sign in
        </h2>
        <p>
          Add a password or a passkey, connect Google or Apple, and see the devices you’re signed in
          on.
        </p>
        <p>
          <Link href="/account/security">Change how you sign in</Link>
        </p>
      </section>

      <section aria-labelledby="download-heading" className={styles.section}>
        <h2 id="download-heading" className="type-heading">
          Your data
        </h2>
        <p>
          Download everything Gaff holds about you as one file: your profile, the homes you enquired
          about, what each letter has, your saved homes and notes, and your alerts.
        </p>
        <p>
          <a href="/my/data" download>
            Download my data
          </a>
        </p>
      </section>

      <section aria-labelledby="delete-heading" className={styles.section}>
        <h2 id="delete-heading" className="type-heading">
          Delete your account
        </h2>
        {letter ? (
          <Notice tone="info" role="status">
            <p>
              You also let homes with Gaff, so your account stays for your workspace. Your renting
              profile, saved homes and alerts can be cleared from their own pages.
            </p>
          </Notice>
        ) : null}
        <p>
          Your profile, saved homes, notes and alerts are deleted at once, and you’re signed out.
        </p>
        {letters.length ? (
          <>
            <p>
              Letters you enquired with keep their own copy of what you sent them until their
              deletion date, as the law allows:
            </p>
            <ul>
              {letters.map((l) => (
                <li key={l.applicationId}>
                  {l.letterName}, for {l.title}
                  {l.deleteAfter
                    ? `: until ${formatDate(l.deleteAfter)}`
                    : ': until 30 days after the letting ends'}
                </li>
              ))}
            </ul>
            <p>
              To ask a letter to delete it sooner, write to them from{' '}
              <Link href="/my">your homes</Link> before you delete your account, or reply to any
              email from them.
            </p>
          </>
        ) : null}
        <form action={deleteAccountAction}>
          <Stack gap={4}>
            {confirm ? (
              <Notice tone="warning" role="alert">
                <p>Tick the box to confirm, then delete.</p>
              </Notice>
            ) : null}
            <label className={styles.confirm}>
              <input type="checkbox" name="confirm" value="yes" />
              <span>I understand this can’t be undone.</span>
            </label>
            <div>
              <SubmitButton variant="secondary" pendingLabel="Deleting…">
                Delete my account
              </SubmitButton>
            </div>
          </Stack>
        </form>
      </section>
    </Stack>
  );
}
