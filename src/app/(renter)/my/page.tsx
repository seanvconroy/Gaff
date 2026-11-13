import type { Metadata } from 'next';
import Link from 'next/link';
import { stageWords } from '@/copy/my-homes';
import { formatDate } from '@/lib/format';
import { myHomes } from '@/server/renters/homes';
import { PageHeader, Stack } from '@/ui/Layout';
import styles from '../renter.module.css';
import { requireRenter } from './renter';

export const metadata: Metadata = { title: 'Your homes' };

/** M79: "My homes": every home the renter enquired about, where it's at, and what's next. */
export default async function MyHomesPage() {
  const { user, profile } = await requireRenter();
  const homes = await myHomes(user.id);
  return (
    <Stack gap={8}>
      <PageHeader eyebrow={`Hello, ${profile.givenName}`} title="Your homes" />
      {homes.length === 0 ? (
        <Stack gap={4}>
          <p>
            When you enquire about a home, you’ll follow it here: the replies, viewings, your
            application and any offer. You’ll always hear back, either way.
          </p>
          <p>
            <Link href="/to-rent">Find homes to rent</Link>
          </p>
        </Stack>
      ) : (
        <ul className={styles.homes}>
          {homes.map((home) => {
            const words = stageWords(home.deletedAt ? null : home.status, home.letterName);
            return (
              <li key={home.applicationId} className={styles.home}>
                <h2 className="type-title">
                  <Link href={`/my/homes/${home.applicationId}`}>{home.title}</Link>
                </h2>
                <p className={styles.muted}>
                  {home.addressShown} · {home.letterName} · enquired {formatDate(home.enquiredAt)}
                </p>
                <p className={styles.stage}>{words.stage}</p>
                <p>{words.next}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Stack>
  );
}
