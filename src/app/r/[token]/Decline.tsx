import { offerCopy } from '@/copy/renter';
import type { RenterModel } from '@/server/renter/model';
import { Button, ButtonLink } from '@/ui/Button';
import { PrivateFrame } from '@/ui/PrivateFrame';
import styles from '../renter.module.css';
import { respondAction } from './offer-actions';
import { Task } from './Task';

const copy = offerCopy.declineStep;

/**
 * R20, UX-RN-20: declining the offer. It asks for no reason. It can't be undone, so it has one
 * screen that says exactly what will happen, and a way back to the offer.
 */
export function DeclineOffer({ token, model }: { token: string; model: RenterModel }) {
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={<p>{copy.text}</p>}
    >
      <Task title={copy.title}>
        <form action={respondAction.bind(null, token, 'decline')} className={styles.actions}>
          <Button type="submit" variant="destructive" fullWidth="phone">
            {copy.button}
          </Button>
          <ButtonLink href={`/r/${token}`} variant="quiet" fullWidth="phone">
            {copy.back}
          </ButtonLink>
        </form>
      </Task>
    </PrivateFrame>
  );
}
