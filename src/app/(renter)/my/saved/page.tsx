import type { Metadata } from 'next';
import Link from 'next/link';
import type { HomeChange } from '@/domain/alerts/alerts';
import { formatDate, formatEuro, formatRent } from '@/lib/format';
import { savedHomesOf } from '@/server/alerts/saved-homes';
import { TextArea } from '@/ui/Field';
import { PageHeader, Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../../renter.module.css';
import { requireRenter } from '../renter';
import { removeSavedAction, saveNoteAction } from './actions';

export const metadata: Metadata = { title: 'Saved homes' };

/** M51, M85: what changed since the renter saved it, in plain words. */
function changeWords(change: HomeChange): string {
  switch (change.kind) {
    case 'rent_down':
      return `The rent is down from ${formatEuro(change.fromCents)} to ${formatRent(change.toCents)}.`;
    case 'rent_up':
      return `The rent is now ${formatRent(change.toCents)}, up from ${formatEuro(change.fromCents)}.`;
    case 'enquiries_closed':
      return 'Enquiries have closed.';
    case 'let_agreed':
      return 'Let agreed: the home is spoken for.';
    case 'let':
      return 'This home has been let.';
    case 'withdrawn':
      return 'This home is no longer available.';
    case 'gone':
      return 'This home is no longer on Gaff.';
  }
}

/** M85: saved homes, with private notes and what changed. Never shared with letters (M10). */
export default async function SavedHomesPage() {
  const { user } = await requireRenter();
  const homes = await savedHomesOf(user.id);
  return (
    <Stack gap={8}>
      <PageHeader
        title="Saved homes"
        lead="Only you can see these, and your notes. Letters never know you saved a home."
      />
      {homes.length === 0 ? (
        <p>
          Tap Save on any home to keep it here. <Link href="/to-rent">Find homes to rent</Link>
        </p>
      ) : (
        <ul className={styles.homes}>
          {homes.map((home) => (
            <li key={home.listingId} className={styles.home}>
              <h2 className="type-title">
                {home.current ? (
                  <Link href={`/home/${home.current.slug}`}>{home.current.title}</Link>
                ) : (
                  'A home you saved'
                )}
              </h2>
              {home.current ? (
                <p className={styles.muted}>
                  {home.current.addressShown} · {formatRent(home.current.rentCents)} · saved{' '}
                  {formatDate(home.savedAt)}
                </p>
              ) : null}
              {home.changes.map((change) => (
                <p key={change.kind} className={styles.stage}>
                  {changeWords(change)}
                </p>
              ))}
              <form action={saveNoteAction.bind(null, home.listingId)}>
                <Stack gap={2}>
                  <TextArea
                    name="note"
                    label="Your note"
                    hint="Only you can see it."
                    rows={2}
                    defaultValue={home.note ?? ''}
                  />
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    Save note
                  </SubmitButton>
                </Stack>
              </form>
              <form action={removeSavedAction.bind(null, home.listingId)}>
                <SubmitButton variant="quiet" pendingLabel="Removing…">
                  Remove from saved
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
