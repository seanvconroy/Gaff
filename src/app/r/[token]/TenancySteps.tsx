import { Check, Circle, CircleDot } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate } from '@/lib/format';
import { Card } from '@/ui/Layout';
import styles from '../renter.module.css';

type Tenancy = {
  startDate: string;
  agreementStatus: string;
  paymentRequestedAt: Date | null;
  paymentDueDate: string | null;
  paymentReceivedAt: Date | null;
  moveInCompletedAt: Date | null;
};

/**
 * Stage 8, the tenant's side: each step with what's done and what's next (design system: every
 * screen says what happens next, and when). Each step's state is an icon and words.
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
  const steps: Array<{ name: string; done: boolean; text: ReactNode }> = [
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
      ) : signed ? (
        <>{operatorName} will send you how to pay them directly.</>
      ) : (
        <>Once the agreement is signed, {operatorName} will send you how to pay them directly.</>
      ),
    },
    {
      name: 'Moving in',
      done: Boolean(tenancy?.moveInCompletedAt),
      text: tenancy?.moveInCompletedAt ? (
        <>Keys handed over on {formatDate(tenancy.moveInCompletedAt)}. Welcome home.</>
      ) : (
        <>
          {operatorName} will be in touch about the keys for{' '}
          {tenancy ? formatDate(tenancy.startDate) : 'your start date'}.
        </>
      ),
    },
  ];
  const now = steps.findIndex((step) => !step.done);
  return (
    <section className={styles.section} aria-labelledby="tenancy-heading">
      <div className={styles.sectionHead}>
        <h2 id="tenancy-heading" className="type-title">
          Your tenancy
        </h2>
        <p>
          You’ve accepted the offer, and your tenancy starts on{' '}
          {tenancy ? formatDate(tenancy.startDate) : 'the date in your offer'}. Here’s what’s done,
          and what’s next.
        </p>
      </div>
      <Card>
        <ol className={styles.steps}>
          {steps.map((step, index) => {
            const Icon = step.done ? Check : index === now ? CircleDot : Circle;
            return (
              <li key={step.name} className={styles.step}>
                <span
                  className={`${styles.stepIcon} ${step.done ? styles.stepDone : index === now ? styles.stepNow : ''}`}
                >
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className={styles.stepText}>
                  <span className={styles.stepName}>
                    {step.name}
                    <span className="visually-hidden">
                      {step.done ? ' (done)' : index === now ? ' (next)' : ' (to come)'}
                    </span>
                  </span>
                  <span>{step.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
