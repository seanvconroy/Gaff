import Link from 'next/link';
import { goLiveCopy } from '@/copy/go-live';
import { homeHref, homePageState } from '@/domain/homes/home-page';
import { onGaffNeeds } from '@/domain/lettings/setup';
import type { LettingRow } from '@/server/lettings/queries';
import { Card, CardHeader } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import { setOnGaffAction } from './on-gaff-actions';
import styles from './letting.module.css';

const copy = goLiveCopy.onGaff;

/**
 * UX-LT-21: whether a live home is shown on gaff.ie, a link to its page when it is, and the
 * switch. Switching it off takes the page down at once; the home still takes enquiries.
 * It sits at the foot of the letting's Home view.
 */
export function OnGaffCard({
  letting,
  photos,
  listerMayShow,
}: {
  letting: Pick<LettingRow, 'id' | 'status' | 'onGaff' | 'berRating' | 'publicRef' | 'hiddenAt'>;
  photos: number;
  /** The lister may have homes live (`goLiveGate`). */
  listerMayShow: boolean;
}) {
  const needs = onGaffNeeds({ berRating: letting.berRating, photos });
  const shown =
    homePageState({
      status: letting.status,
      onGaff: letting.onGaff,
      berRating: letting.berRating,
      photos,
      hiddenAt: letting.hiddenAt,
      pageRemovedAt: null,
      listerMayShow,
    }) === 'live';
  return (
    <Card labelledBy="on-gaff-heading">
      <CardHeader id="on-gaff-heading" title={copy.title} />
      {shown ? (
        <p>
          {copy.shown}{' '}
          <Link href={homeHref(letting.publicRef)} className={styles.change}>
            {copy.seePage}
          </Link>
        </p>
      ) : (
        <p className={styles.muted}>
          {!letting.onGaff
            ? copy.off
            : needs.length > 0
              ? copy.needs({ ber: needs.includes('ber'), photo: needs.includes('photo') })
              : copy.held}
        </p>
      )}
      <form action={setOnGaffAction.bind(null, letting.id)}>
        <input type="hidden" name="on" value={letting.onGaff ? '0' : '1'} />
        <SubmitButton variant="secondary" pendingLabel={copy.saving}>
          {letting.onGaff ? copy.turnOff : copy.turnOn}
        </SubmitButton>
      </form>
    </Card>
  );
}
