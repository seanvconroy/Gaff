import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { tenancyCopy } from '@/copy/tenancy-steps';
import { usualDaysChoices, usualHoursChoices, usualStillToAsk } from '@/domain/tenancy/results';
import { requireMember } from '@/server/auth/member';
import { letResults } from '@/server/tenancy/results';
import { StepForm } from '../../tenancy/StepForm';
import { usualAction } from '../actions';

export const metadata: Metadata = { title: 'Your usual' };
export const dynamic = 'force-dynamic';

const copy = tenancyCopy.usual;

/**
 * UX-TN-7 (Q15): "your usual", asked once, at the first close, if a pilot's onboarding didn't
 * set it: two questions, one per screen, each a tap answer. It is not a settings section.
 */
export default async function UsualPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  const results = await letResults(member, lettingId);
  const letHref = `/lettings/${lettingId}/let`;
  if (!results) redirect(`/lettings/${lettingId}/tenancy`);
  const question = results.canSetUsual ? usualStillToAsk(results.usual) : null;
  if (!question) redirect(letHref);
  const choices = question === 'days' ? usualDaysChoices : usualHoursChoices;
  return (
    <StepForm
      key={question}
      action={usualAction.bind(null, lettingId, question)}
      leave={{ kind: 'close', href: letHref }}
      title={question === 'days' ? copy.daysTitle : copy.hoursTitle}
      lead={question === 'days' ? copy.daysLead : copy.hoursLead}
      fields={[
        {
          kind: 'choice',
          name: 'answer',
          legend: question === 'days' ? copy.daysTitle : copy.hoursTitle,
          hideLegend: true,
          type: 'radio',
          options: choices.map((c) => ({ value: String(c.value), label: c.label })),
        },
      ]}
      progress={{
        label: copy.progress,
        segments: [copy.daysStep, copy.hoursStep],
        current: question === 'days' ? 0 : 1,
      }}
      primary={copy.button}
      pendingLabel="Saving…"
    />
  );
}
