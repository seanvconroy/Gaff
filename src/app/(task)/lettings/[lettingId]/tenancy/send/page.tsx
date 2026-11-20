import type { Metadata } from 'next';
import Link from 'next/link';
import { tenancyCopy as copy } from '@/copy/tenancy-steps';
import { operatorStepHref } from '@/domain/tenancy/operator-steps';
import { formatDate, formatDateTime, formatEuro } from '@/lib/format';
import { SummaryList } from '@/ui/SummaryList';
import { ownerAction, sendAction } from '../actions';
import { loadStep, type StepProps } from '../step';
import { StepDone } from '../StepDone';
import { StepForm } from '../StepForm';

export const metadata: Metadata = { title: 'Send the agreement' };
export const dynamic = 'force-dynamic';

/**
 * Step 1 (UX-TN-1, R22): the agreement, filled in from the offer, to read and send. The first
 * time an agency's home has no owner on file, the screen asks for the owner's name first.
 */
export default async function SendAgreementPage({ params }: StepProps) {
  const { view, lettingId, state, tenancyHref, first } = await loadStep(params, 'send_agreement');
  const { tenancy } = view;
  const leave = { kind: 'close' as const, href: tenancyHref };

  if (state === 'done') {
    const signed = ['signed', 'signed_on_paper'].includes(tenancy.agreementStatus);
    return (
      <StepDone
        leaveHref={tenancyHref}
        tone={signed ? 'success' : 'waiting'}
        title={
          tenancy.agreementStatus === 'signed_on_paper'
            ? copy.sign.paperTitle
            : signed
              ? copy.sign.signedTitle
              : copy.send.sentTitle(first)
        }
        onwards={
          tenancy.agreementStatus === 'tenant_signed'
            ? {
                href: operatorStepHref(lettingId, 'sign_agreement'),
                label: copy.sign.button,
              }
            : { href: tenancyHref, label: copy.done }
        }
      >
        <p>
          {tenancy.agreementStatus === 'signed_on_paper'
            ? copy.sign.paperText
            : signed
              ? copy.sign.signedText(first)
              : `${tenancy.agreementSentAt ? `${formatDateTime(tenancy.agreementSentAt)}. ` : ''}${copy.send.sentText(first)}`}
        </p>
      </StepDone>
    );
  }

  if (view.needsLandlord) {
    return (
      <StepForm
        action={ownerAction.bind(null, lettingId)}
        leave={leave}
        title={copy.send.ownerTitle(view.letting.addressLine1)}
        lead={copy.send.ownerLead}
        fields={[
          { kind: 'text', name: 'landlordName', label: copy.send.ownerName },
          {
            kind: 'text',
            name: 'landlordEmail',
            label: copy.send.ownerEmail,
            type: 'email',
            inputMode: 'email',
          },
        ]}
        primary={copy.send.ownerSave}
        pendingLabel="Saving…"
      />
    );
  }

  return (
    <StepForm
      action={sendAction.bind(null, lettingId)}
      leave={leave}
      title={copy.send.title(first)}
      lead={copy.send.lead(first)}
      primary={copy.send.button(first)}
      pendingLabel={copy.send.sending}
      alternative={{
        summary: copy.paper.summary,
        text: copy.paper.text(first),
        button: copy.paper.button,
        intent: 'paper',
      }}
    >
      <SummaryList
        rows={[
          { label: 'Tenant', value: view.tenant.fullName },
          { label: 'Starts', value: formatDate(tenancy.startDate) },
          { label: 'Rent', value: `${formatEuro(tenancy.rentCents)} a month` },
          { label: 'Deposit', value: formatEuro(tenancy.depositCents) },
        ]}
      />
      <p>
        <Link href={`${tenancyHref}/agreement`}>{copy.overview.readAgreement}</Link>
      </p>
    </StepForm>
  );
}
