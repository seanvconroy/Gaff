import type { Metadata } from 'next';
import { tenancyCopy as copy } from '@/copy/tenancy-steps';
import { operatorStepHref } from '@/domain/tenancy/operator-steps';
import { formatIban, paymentAmounts } from '@/domain/tenancy/payment';
import { formatDate, formatEuro, irishToday } from '@/lib/format';
import { hasPasskey } from '@/server/auth/confirm-request';
import { SummaryList } from '@/ui/SummaryList';
import { accountAction, phoneAction, requestAction } from '../actions';
import { loadStep, type StepProps } from '../step';
import { StepDone } from '../StepDone';
import { StepForm } from '../StepForm';
import { AccountStep } from './AccountStep';

export const metadata: Metadata = { title: 'Ask for the deposit and first month’s rent' };
export const dynamic = 'force-dynamic';

/**
 * Step 3 (UX-TN-1, UX-TN-2, R23): the amounts, a pay-by date and a reference, filled in. The
 * first time, it asks first where tenants pay (UX-TN-2) and, if there isn't one, a number the
 * tenant can ring to check it (UX-RN-23). Each is remembered, and never asked in set-up.
 */
export default async function RequestPaymentPage({ params }: StepProps) {
  const { member, view, lettingId, state, tenancyHref, first } = await loadStep(
    params,
    'request_payment',
  );
  const { tenancy, organisation } = view;
  const amounts = paymentAmounts(tenancy);
  const total = formatEuro(amounts.totalCents);

  if (state === 'done') {
    return (
      <StepDone
        leaveHref={tenancyHref}
        tone="waiting"
        title={copy.request.sentTitle(first)}
        onwards={{ href: tenancyHref, label: copy.done }}
      >
        <p>
          {copy.request.sentText(
            first,
            total,
            tenancy.paymentDueDate ? formatDate(tenancy.paymentDueDate) : '',
            tenancy.paymentReference ?? '',
          )}
        </p>
      </StepDone>
    );
  }

  if (!organisation.paymentIban || !organisation.paymentAccountName) {
    return (
      <AccountStep
        action={accountAction.bind(null, lettingId)}
        leaveHref={tenancyHref}
        first={first}
        email={member.email}
        hasPasskey={await hasPasskey(member.userId)}
      />
    );
  }

  if (!organisation.phone) {
    return (
      <StepForm
        action={phoneAction.bind(null, lettingId)}
        leave={{ kind: 'close', href: tenancyHref }}
        title={copy.phone.title(first)}
        lead={copy.phone.lead(first)}
        fields={[
          {
            kind: 'text',
            name: 'phone',
            label: copy.phone.label,
            hint: copy.phone.hint,
            type: 'tel',
            inputMode: 'tel',
            width: 'medium',
          },
        ]}
        primary={copy.phone.button}
        pendingLabel="Saving…"
      />
    );
  }

  const today = irishToday();
  return (
    <StepForm
      action={requestAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: tenancyHref }}
      title={copy.request.title(first)}
      lead={copy.request.lead(first)}
      fields={[
        {
          kind: 'text',
          name: 'dueDate',
          label: copy.request.payBy,
          type: 'date',
          width: 'medium',
          min: today,
          defaultValue: tenancy.startDate > today ? tenancy.startDate : today,
        },
      ]}
      primary={copy.request.button(first)}
      pendingLabel={copy.request.sending}
      back={{ href: operatorStepHref(lettingId, 'sign_agreement'), label: 'Back' }}
    >
      <SummaryList
        layout="split"
        rows={[
          { label: copy.request.deposit, value: formatEuro(amounts.depositCents) },
          { label: copy.request.firstRent, value: formatEuro(amounts.firstRentCents) },
          { label: copy.request.total, value: total },
        ]}
      />
      <SummaryList
        rows={[
          {
            label: copy.request.payInto,
            value: `${organisation.paymentAccountName}, ${formatIban(organisation.paymentIban)}`,
          },
          { label: copy.request.reference, value: `GAFF-${view.tenant.ref.toUpperCase()}` },
          { label: copy.request.ring, value: organisation.phone },
        ]}
      />
    </StepForm>
  );
}
