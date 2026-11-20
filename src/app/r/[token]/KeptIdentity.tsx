import type { ReactNode } from 'react';
import { checksCopy } from '@/copy/renter';
import { ButtonLink } from '@/ui/Button';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { keepIdentityAction, reuseKeptIdentityAction } from './check-actions';
import { Task } from './Task';

const k = checksCopy.keptId;

/**
 * What the renter's page shows of a verified identity, at their checks (Q35). Only on a page
 * whose renter an operator has chosen, and the first two only to the signed-in person whose
 * enquiry it is, from their own profile.
 */
export interface IdentityView {
  /** UX-PF-12, UX-PF-14: at the ID check, the one they keep. Null: the check itself. */
  step:
    | { step: 'use_kept'; name: string; on: string }
    | { step: 'check_name'; name: string; on: string; applied: string }
    | null;
  /** UX-PF-8: the check for this home just passed. */
  keep: { name: string; on: string; signedIn: boolean } | null;
  /** They came back from keeping it: whether it was kept. */
  kept: 'yes' | 'no' | null;
}

/**
 * UX-PF-12: "Use the ID check you did on 3 October?" Yes passes this home's ID check with it;
 * no is the check itself. UX-PF-14: when its name isn't the application's, they're asked to
 * check their name, or do the check again.
 */
export function ReuseKeptIdentity({
  token,
  step,
  notice,
}: {
  token: string;
  step: NonNullable<IdentityView['step']>;
  /** UX-RN-16: what's kept, who sees it and when it's deleted. */
  notice: ReactNode;
}) {
  const again = `/r/${token}?q=new_id`;
  if (step.step === 'check_name') {
    return (
      <section className={styles.task} aria-labelledby="next-check">
        <div className={styles.titles}>
          <h3 id="next-check" className="type-title">
            {k.checkNameTitle}
          </h3>
          <p>{k.checkNameText(step.name, step.applied)}</p>
        </div>
        <p>{k.checkNameHow}</p>
        {notice}
        <div className={styles.actions}>
          <form action={reuseKeptIdentityAction.bind(null, token, true)}>
            <SubmitButton fullWidth="phone" pendingLabel={k.using}>
              {k.useVerified}
            </SubmitButton>
          </form>
          <ButtonLink href={again} variant="quiet" fullWidth="phone">
            {k.checkAgain}
          </ButtonLink>
        </div>
      </section>
    );
  }
  return (
    <section className={styles.task} aria-labelledby="next-check">
      <div className={styles.titles}>
        <h3 id="next-check" className="type-title">
          {k.useTitle(step.on)}
        </h3>
        <p>{k.useText(step.name)}</p>
      </div>
      {notice}
      <div className={styles.actions}>
        <form action={reuseKeptIdentityAction.bind(null, token, false)}>
          <SubmitButton fullWidth="phone" pendingLabel={k.using}>
            {k.use}
          </SubmitButton>
        </form>
        <ButtonLink href={again} variant="quiet" fullWidth="phone">
          {k.doAgain}
        </ButtonLink>
      </div>
    </section>
  );
}

/** UX-PF-8: one screen after the check passes. "Keep it" is the primary action. */
export function KeepIdentity({
  token,
  keep,
}: {
  token: string;
  keep: NonNullable<IdentityView['keep']>;
}) {
  return (
    <Task title={k.keepTitle} lead={k.keepLead(keep.name, keep.on)}>
      <p>{k.keepText}</p>
      {keep.signedIn ? null : <p>{k.keepCode}</p>}
      <div className={styles.actions}>
        <form action={keepIdentityAction.bind(null, token)}>
          <SubmitButton fullWidth="phone" pendingLabel={k.keeping}>
            {k.keep}
          </SubmitButton>
        </form>
        <ButtonLink href={`/r/${token}`} variant="quiet" fullWidth="phone">
          {k.notNow}
        </ButtonLink>
      </div>
      <p>{k.keepNext}</p>
    </Task>
  );
}

/** After "Keep it" and its code: whether it was kept, said once. */
export function KeptNote({ kept }: { kept: 'yes' | 'no' }) {
  return kept === 'yes' ? (
    <Notice tone="success" title={k.kept} role="status">
      <p>{k.keptNext}</p>
    </Notice>
  ) : (
    <Notice tone="warning" role="status">
      <p>{k.notKept}</p>
    </Notice>
  );
}
