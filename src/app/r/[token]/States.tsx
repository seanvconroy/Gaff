import { failedCopy, loadingCopy } from '@/copy/renter';
import { Button } from '@/ui/Button';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { Skeleton, SkeletonGroup } from '@/ui/Skeleton';
import styles from '../renter.module.css';

/**
 * Two of a renter's states (section 5, "States"), for every page under their link. Neither knows
 * whose link it is yet, so the frame names nobody; "Talk to a person" still works.
 */

/** Loading: the page's frame at once. The task takes its place, and fades in, when it's ready. */
export function RenterLoading() {
  return (
    <PrivateFrame audience="renter" lister={null}>
      <SkeletonGroup label={loadingCopy.label}>
        <Skeleton shape="title" width="long" />
        <Skeleton width="full" />
        <Skeleton width="half" />
        <Skeleton shape="control" width="full" />
      </SkeletonGroup>
    </PrivateFrame>
  );
}

/**
 * A page that couldn't load, or a button whose action never arrived: one sentence in place of
 * the content, and "Try again". Nothing here blames anyone or shows what went wrong inside.
 */
export function RenterFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <PrivateFrame audience="renter" lister={null}>
      <div className={styles.task}>
        <Outcome tone="warning" title={failedCopy.title} headingLevel={1} role="alert">
          <p>{failedCopy.text}</p>
        </Outcome>
        <div className={styles.actions}>
          <Button variant="primary" fullWidth="phone" onClick={onRetry}>
            {failedCopy.button}
          </Button>
        </div>
      </div>
    </PrivateFrame>
  );
}
