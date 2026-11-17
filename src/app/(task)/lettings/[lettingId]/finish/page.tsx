import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { tenancyCopy } from '@/copy/tenancy-steps';
import { env } from '@/lib/env';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { finishView } from '@/server/tenancy/results';
import { Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import { SummaryList } from '@/ui/SummaryList';
import { StepForm } from '../tenancy/StepForm';
import { finishAction } from './actions';

export const metadata: Metadata = { title: 'Finish this letting' };
export const dynamic = 'force-dynamic';

const copy = tenancyCopy.finish;

/**
 * UX-TN-5 (R26), closing, screen 1: "Finish this letting". What's done, and anything still open
 * (the RTB registration), then Finish. The results come next (`/let`).
 */
export default async function FinishPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const tenancyHref = `/lettings/${lettingId}/tenancy`;
  const view = await finishView(member, lettingId);
  if (!view) redirect(tenancyHref);
  if (view.closedAt) redirect(`/lettings/${lettingId}/let`);
  if (!view.canFinish) redirect(tenancyHref);

  const row = (label: string, done: boolean) => ({
    label,
    value: done ? (
      <StatusPill tone="success">{copy.done}</StatusPill>
    ) : (
      <StatusPill tone="warning">{copy.open}</StatusPill>
    ),
  });
  return (
    <StepForm
      action={finishAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: tenancyHref }}
      title={copy.title}
      lead={copy.lead(view.address)}
      primary={copy.button}
      pendingLabel={copy.finishing}
    >
      <Stack gap={4}>
        <SummaryList
          layout="split"
          rows={[
            row(copy.agreement, view.agreementSigned),
            row(copy.payment, view.paymentReceived),
            row(copy.rtb, view.rtbRegistered),
            row(copy.keys, view.movedIn),
          ]}
        />
        {!view.rtbRegistered ? <p>{copy.rtbOpen}</p> : null}
        <p>{copy.save(env().RETENTION_PERSONAL_DAYS)}</p>
      </Stack>
    </StepForm>
  );
}
