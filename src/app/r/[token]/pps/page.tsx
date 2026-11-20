import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { tenancyCopy } from '@/copy/renter';
import { Button, ButtonLink } from '@/ui/Button';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import styles from '../../renter.module.css';
import { LinkEnded, loadRenter } from '../load';
import { removePpsnAction } from '../ppsn-actions';
import { PpsStep } from '../PpsStep';
import { Task } from '../Task';

export const metadata: Metadata = { title: 'Your PPS number' };
export const dynamic = 'force-dynamic';

const copy = tenancyCopy.pps;

/**
 * R24 (Q24), UX-RN-24: the PPS number's own page. The tenant's page asks for it once, after
 * payment; this address is where a tenant can still give it, or take it back, until the tenancy
 * is registered. Nothing links here from the other steps, so it's never repeated on them.
 */
export default async function PpsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  const { page, model } = loaded;
  const tenancy = page.tenancy;
  if (model.view !== 'tenancy' || !tenancy) redirect(`/r/${token}`);
  const back = (
    <ButtonLink href={`/r/${token}`} variant="quiet" fullWidth="phone">
      {copy.back}
    </ButtonLink>
  );
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={tenancy.rtbRegisteredAt ? undefined : <p>{copy.next(model.operator)}</p>}
    >
      {tenancy.rtbRegisteredAt ? (
        <Task>
          <Outcome tone="info" title={copy.notNeeded}>
            <p>{copy.notNeededText}</p>
          </Outcome>
          <div className={styles.actions}>{back}</div>
        </Task>
      ) : tenancy.ppsnGivenAt ? (
        <Task>
          <Outcome tone="success" title={copy.given} />
          <form action={removePpsnAction.bind(null, token)} className={styles.actions}>
            <Button type="submit" variant="secondary" fullWidth="phone">
              {copy.remove}
            </Button>
            {back}
          </form>
        </Task>
      ) : (
        <Task title={copy.title} lead={copy.why(model.operator)}>
          <PpsStep token={token} />
        </Task>
      )}
    </PrivateFrame>
  );
}
