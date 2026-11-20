import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { tenancyCopy } from '@/copy/tenancy-steps';
import { RTB_WEBSITE_URL } from '@/domain/tenancy/tenancy';
import { formatDate, formatEuro } from '@/lib/format';
import { rtbPack } from '@/server/tenancy/rtb';
import { buttonProps } from '@/ui/Button';
import { CopyButton } from '@/ui/CopyButton';
import { SummaryList, type SummaryRow } from '@/ui/SummaryList';
import { revealPpsnAction, rtbAction } from '../actions';
import { loadStep, type StepProps } from '../step';
import { StepDone } from '../StepDone';
import { StepForm } from '../StepForm';
import { ShowPpsn } from './ShowPpsn';

export const metadata: Metadata = { title: 'Register with the RTB' };
export const dynamic = 'force-dynamic';

const copy = tenancyCopy.rtb;

/**
 * Step 5 (UX-TN-3, R24, Q24): everything the RTB's form asks for, as label and value pairs, each
 * with a copy button; the deadline; a button to the RTB's site; then "I've registered it". The
 * tenant's PPS number is hidden, and not in the page, until "Show" is pressed (rule 2); it's
 * deleted once the registration is recorded. No date of birth: Gaff never collects one (rule 3).
 */
export default async function RtbPage({ params }: StepProps) {
  const { member, lettingId, state, tenancyHref } = await loadStep(params, 'register_rtb');
  const pack = (await rtbPack(member, lettingId))!;
  const lettingHref = `/lettings/${lettingId}`;
  const back = { href: lettingHref, label: copy.back };

  if (state === 'done') {
    return (
      <StepDone
        leaveHref={tenancyHref}
        title={copy.doneTitle}
        onwards={{ href: tenancyHref, label: tenancyCopy.done }}
      >
        <p>{copy.doneText(formatDate(pack.tenancy.rtbRegisteredAt!), pack.tenancy.rtbReference)}</p>
      </StepDone>
    );
  }

  const isAgency = pack.organisation.kind === 'agency';
  const pair = (label: string, value: string | null): SummaryRow => ({
    label,
    value: value ?? copy.notGiven,
    action: value ? <CopyButton value={value} what={label.toLowerCase()} /> : undefined,
  });
  const rows: SummaryRow[] = [
    pair(copy.labels.home, `${pack.letting.addressLine1}, ${pack.letting.area}`),
    pair(copy.labels.bedrooms, String(pack.letting.bedrooms)),
    pair(copy.labels.start, formatDate(pack.tenancy.startDate)),
    pair(copy.labels.rent, formatEuro(pack.tenancy.rentCents)),
    pair(copy.labels.deposit, formatEuro(pack.tenancy.depositCents)),
    pair(copy.labels.landlord, isAgency ? pack.landlordName : pack.organisation.name),
    ...(isAgency
      ? [
          pair(copy.labels.agent, pack.organisation.name),
          pair(copy.labels.licence, pack.organisation.psraLicenceNumber),
        ]
      : []),
    pair(copy.labels.tenant, pack.tenant.fullName),
    pair(copy.labels.email, pack.tenant.email),
    pair(copy.labels.phone, pack.tenant.phone),
    {
      label: copy.labels.ppsn,
      value: pack.ppsn ? (
        <ShowPpsn
          reveal={revealPpsnAction.bind(null, lettingId)}
          hiddenLabel={copy.ppsnHidden}
          showLabel={copy.show}
          what={copy.showWhat}
        />
      ) : (
        copy.ppsnNotGiven
      ),
    },
  ];

  return (
    <StepForm
      action={rtbAction.bind(null, lettingId)}
      leave={{ kind: 'back', href: lettingHref, label: copy.back }}
      back={back}
      title={copy.title}
      lead={copy.lead(formatDate(pack.deadline))}
      fields={[
        {
          kind: 'text',
          name: 'reference',
          label: copy.reference,
          hint: copy.referenceHint,
          optional: true,
          width: 'medium',
        },
      ]}
      primary={copy.button}
      pendingLabel={copy.saving}
    >
      <SummaryList rows={rows} />
      <div>
        <a
          href={RTB_WEBSITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          {...buttonProps('secondary', 'phone')}
        >
          <span>{copy.openRtb}</span>
          <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
    </StepForm>
  );
}
