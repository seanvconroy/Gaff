import { formatIban, paymentAmounts } from '@/domain/tenancy/payment';
import { formatDate, formatEuro } from '@/lib/format';
import { CopyButton } from '@/ui/CopyButton';
import { Card } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { SummaryList } from '@/ui/SummaryList';
import styles from '../renter.module.css';

/**
 * R23: what to pay, by when, and where: the operator's own account, never Gaff (rule 5). The
 * renter is asked to confirm the details by phone, because payment-diversion scams copy emails.
 */
export function PaymentDetails({
  operatorName,
  tenancy,
  payTo,
}: {
  operatorName: string;
  tenancy: {
    rentCents: number;
    depositCents: number;
    paymentDueDate: string | null;
    paymentReference: string | null;
    paymentReceivedAt: Date | null;
  };
  payTo: { accountName: string; iban: string };
}) {
  const amounts = paymentAmounts(tenancy);
  if (tenancy.paymentReceivedAt) {
    return (
      <Outcome tone="success" title="Payment received" role="status">
        <p>
          {operatorName} received your {formatEuro(amounts.totalCents)} on{' '}
          {formatDate(tenancy.paymentReceivedAt)}. Thank you. They’ll be in touch about moving in.
        </p>
      </Outcome>
    );
  }
  const iban = formatIban(payTo.iban);
  return (
    <section className={styles.section} aria-labelledby="pay-heading">
      <div className={styles.sectionHead}>
        <h2 id="pay-heading" className="type-title">
          Pay the deposit and first month’s rent
        </h2>
        <p>
          Paid straight to {operatorName}
          {tenancy.paymentDueDate ? `, by ${formatDate(tenancy.paymentDueDate)}` : ''}.
        </p>
      </div>
      <Card>
        <SummaryList
          layout="split"
          rows={[
            { label: 'Deposit', value: formatEuro(amounts.depositCents) },
            { label: 'First month’s rent', value: formatEuro(amounts.firstRentCents) },
            { label: 'To pay', value: formatEuro(amounts.totalCents) },
            {
              label: 'By',
              value: tenancy.paymentDueDate ? formatDate(tenancy.paymentDueDate) : '',
            },
          ]}
        />
      </Card>
      <Card>
        <h3 className="type-title">Pay into</h3>
        <SummaryList
          rows={[
            { label: 'Name on the account', value: payTo.accountName },
            {
              label: 'IBAN',
              value: <span className={styles.mono}>{iban}</span>,
              action: <CopyButton value={iban.replace(/\s+/g, '')} what="the IBAN" />,
            },
            {
              label: 'Reference',
              value: <span className={styles.mono}>{tenancy.paymentReference ?? ''}</span>,
              action: tenancy.paymentReference ? (
                <CopyButton value={tenancy.paymentReference} what="the reference" />
              ) : null,
            },
          ]}
        />
      </Card>
      <Notice tone="warning" title="Check the bank details by phone first">
        <p>
          Before you pay, call {operatorName} to confirm these details. We’ll never email you
          different ones. You pay {operatorName} directly; nothing is paid to Gaff, and there are no
          other fees.
        </p>
      </Notice>
      <div className={styles.next}>
        <p className={styles.nextTitle}>What happens next</p>
        <p>
          Once the money arrives, {operatorName} confirms it here, and we’ll email you a receipt.
        </p>
      </div>
    </section>
  );
}
