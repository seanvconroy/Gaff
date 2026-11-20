import type { Metadata } from 'next';
import { tenancyCopy as copy } from '@/copy/tenancy-steps';
import { operatorStepHref } from '@/domain/tenancy/operator-steps';
import { paymentAmounts } from '@/domain/tenancy/payment';
import { formatDate, formatEuro } from '@/lib/format';
import { receivedAction } from '../actions';
import { loadStep, type StepProps } from '../step';
import { StepDone } from '../StepDone';
import { StepForm } from '../StepForm';

export const metadata: Metadata = { title: 'Mark the payment received' };
export const dynamic = 'force-dynamic';

/** Step 4 (UX-TN-1, R23): one button, once the money is in the operator's own account. */
export default async function PaymentReceivedPage({ params }: StepProps) {
  const { view, lettingId, state, tenancyHref, first } = await loadStep(params, 'confirm_payment');
  const { tenancy } = view;
  if (state === 'done') {
    return (
      <StepDone
        leaveHref={tenancyHref}
        title={copy.received.doneTitle}
        onwards={
          tenancy.rtbRegisteredAt
            ? { href: tenancyHref, label: copy.done }
            : { href: operatorStepHref(lettingId, 'register_rtb'), label: copy.rtb.title }
        }
      >
        <p>
          {tenancy.paymentReceivedAt ? `${formatDate(tenancy.paymentReceivedAt)}. ` : ''}
          {copy.received.doneText(first)}
        </p>
      </StepDone>
    );
  }
  return (
    <StepForm
      action={receivedAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: tenancyHref }}
      title={copy.received.title(first)}
      lead={copy.received.lead(
        formatEuro(paymentAmounts(tenancy).totalCents),
        tenancy.paymentReference ?? '',
        tenancy.paymentDueDate ? formatDate(tenancy.paymentDueDate) : '',
      )}
      primary={copy.received.button}
      pendingLabel={copy.received.saving}
    />
  );
}
