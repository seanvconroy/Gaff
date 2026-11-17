import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { applyCopy } from '@/copy/renter';
import { incomeAsTyped, incomeToOffer, keepingFor } from '@/domain/profile/offer-back';
import { formatDate } from '@/lib/format';
import { personOnRenterPage } from '@/server/renter/person';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { ApplyFlow } from '../ApplyFlow';
import { LinkEnded, loadRenter } from '../load';

export const metadata: Metadata = { title: 'Your application' };
export const dynamic = 'force-dynamic';

/**
 * R16, UX-RN-11: applying, for someone who came to view: two questions, one per screen, then a
 * check screen. Someone who has applied can change it until a person has chosen. Anyone else is
 * sent to their own page (rule 2: income is asked only at applications).
 */
export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { token } = await params;
  const { q } = await searchParams;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  const { model } = loaded;
  if (model.view !== 'after_viewing' && model.view !== 'applied') redirect(`/r/${token}`);
  // UX-RH-4, UX-PF-2, UX-PF-5: a signed-in renter whose enquiry this is. Their kept income is
  // offered back, with its date, only at the stage that asks for it (rule 2).
  const person = await personOnRenterPage(token, loaded.page, { attach: true });
  const income = person ? incomeToOffer(person.kept, model.view) : null;
  const current = {
    earning: income?.earning ?? model.application.earning,
    monthlyIncome: income
      ? incomeAsTyped(income.monthlyIncomeCents)
      : model.application.monthlyIncome,
    fullName: model.fullName,
    email: model.email,
  };
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={<p>{applyCopy.next(model.operator)}</p>}
    >
      <ApplyFlow
        token={token}
        operator={model.operator}
        rule={model.application.rule}
        sentTo={loaded.sentTo}
        current={current}
        startAt={q}
        keeping={keepingFor(person ? { theirs: true, keepsDetails: person.keepsDetails } : null)}
        offered={income ? { saidOn: formatDate(income.saidOn) } : null}
      />
    </PrivateFrame>
  );
}
