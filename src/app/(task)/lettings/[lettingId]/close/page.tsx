import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { lettingPageCopy } from '@/copy/letting-page';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { getLetting } from '@/server/lettings/queries';
import { StepForm } from '../tenancy/StepForm';
import { closeAction } from './actions';

const copy = lettingPageCopy.close;

export const metadata: Metadata = { title: copy.metaTitle };
export const dynamic = 'force-dynamic';

/**
 * R26, UX-LP-5: "Close this letting", from the letting's menu. One question, how it ended, then
 * Close. It's a person's decision: everyone who enquired hears back.
 */
export default async function CloseLettingPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { lettingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  const member = await requireMember();
  const detail = await getLetting(member, lettingId);
  if (!detail) notFound();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const lettingHref = `/lettings/${lettingId}`;
  if (detail.letting.status !== 'live') redirect(lettingHref);
  return (
    <StepForm
      action={closeAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: lettingHref }}
      title={copy.title}
      lead={copy.lead}
      fields={[
        {
          kind: 'choice',
          name: 'outcome',
          legend: copy.title,
          hideLegend: true,
          type: 'radio',
          options: [
            { value: 'let', label: copy.let },
            { value: 'withdrawn', label: copy.withdrawn },
          ],
        },
      ]}
      primary={copy.button}
      pendingLabel={copy.closing}
    />
  );
}
