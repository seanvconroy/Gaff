import type { Metadata } from 'next';
import { dataGroupWords, type DataGroup } from '@/domain/profiles/sharing';
import { formatDate } from '@/lib/format';
import { whoHasMyDetails } from '@/server/renters/homes';
import { PageHeader, Stack } from '@/ui/Layout';
import styles from '../../renter.module.css';
import { requireRenter } from '../renter';

export const metadata: Metadata = { title: 'Who has my details' };

/** M12: for each letter, what they have, since when, and when it will be deleted. */
export default async function WhoHasMyDetailsPage() {
  const { user, profile } = await requireRenter();
  const letters = await whoHasMyDetails(user.id);
  return (
    <Stack gap={8}>
      <PageHeader
        title="Who has my details"
        lead="Each letter gets only what they need at each step, and deletes it on a set date."
      />
      <section aria-labelledby="gaff-heading" className={styles.section}>
        <h2 id="gaff-heading" className="type-title">
          Gaff
        </h2>
        <p>
          {profile.keepDetails
            ? 'You asked Gaff to keep your mobile number and answers for next time. They’re kept until you delete them, or for 2 years after you last use them.'
            : 'Gaff keeps only your first name and email address, for your account. Untick “Keep my details” whenever you enquire to keep it that way.'}
        </p>
      </section>
      {letters.length === 0 ? (
        <p>No letter has your details yet.</p>
      ) : (
        <ul className={styles.homes}>
          {letters.map((entry) => (
            <li key={entry.applicationId} className={styles.home}>
              <h2 className="type-title">{entry.letterName}</h2>
              <p className={styles.muted}>
                For {entry.title}, since {formatDate(entry.since)}
              </p>
              {entry.deleted ? (
                <p>They’ve deleted your details.</p>
              ) : (
                <>
                  <ul>
                    {entry.groups.map((group) => (
                      <li key={group}>{dataGroupWords[group as DataGroup]}</li>
                    ))}
                  </ul>
                  <p>
                    {entry.deleteAfter
                      ? `They delete it on ${formatDate(entry.deleteAfter)}.`
                      : 'They delete it within 30 days of the letting ending, unless you’re the new tenant.'}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
