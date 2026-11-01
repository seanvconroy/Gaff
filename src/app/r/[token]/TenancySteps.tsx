import { formatDate } from '@/lib/format';
import { Card, Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import styles from '../renter.module.css';

type Tenancy = {
  startDate: string;
  agreementStatus: string;
  paymentRequestedAt: Date | null;
  paymentDueDate: string | null;
  paymentReceivedAt: Date | null;
};

/**
 * Stage 8, the tenant's side: each step with what's done and what's next (design system: every
 * screen says what happens next, and when).
 */
export function TenancySteps({
  token,
  operatorName,
  tenancy,
}: {
  token: string;
  operatorName: string;
  tenancy: Tenancy | null;
}) {
  const signed = ['signed', 'signed_on_paper'].includes(tenancy?.agreementStatus ?? '');
  const steps: Array<{ name: string; done: boolean; text: React.ReactNode }> = [
    {
      name: 'Your agreement',
      done: signed,
      text: signed ? (
        <>
          Signed. <a href={`/r/${token}/agreement`}>Read your copy</a>
        </>
      ) : tenancy?.agreementStatus === 'with_tenant' ? (
        <a href={`/r/${token}/agreement`}>Read and sign your tenancy agreement</a>
      ) : tenancy?.agreementStatus === 'tenant_signed' ? (
        <>You’ve signed. Waiting for {operatorName} to sign too.</>
      ) : (
        <>{operatorName} is preparing it, and will email you when it’s ready to sign.</>
      ),
    },
    {
      name: 'The deposit and first month’s rent',
      done: Boolean(tenancy?.paymentReceivedAt),
      text: tenancy?.paymentReceivedAt ? (
        <>Received. Thank you.</>
      ) : tenancy?.paymentRequestedAt ? (
        <>
          To pay by {tenancy.paymentDueDate ? formatDate(tenancy.paymentDueDate) : 'the date below'}
          . The details are below.
        </>
      ) : (
        <>Once the agreement is signed, {operatorName} will send you how to pay them directly.</>
      ),
    },
  ];
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <h2 className="type-title">Your tenancy</h2>
        <p>
          You’ve accepted the offer, and your tenancy starts on{' '}
          {tenancy ? formatDate(tenancy.startDate) : 'the date in your offer'}. Here’s what’s done,
          and what’s next.
        </p>
      </Stack>
      <Card>
        <ul className={styles.steps}>
          {steps.map((step) => (
            <li key={step.name} className={styles.step}>
              <StatusPill tone={step.done ? 'success' : 'neutral'}>
                {step.done ? 'Done' : 'To do'}
              </StatusPill>
              <span>
                <strong>{step.name}.</strong> {step.text}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Stack>
  );
}
