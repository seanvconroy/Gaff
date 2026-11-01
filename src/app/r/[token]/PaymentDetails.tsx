import { formatIban, paymentAmounts } from '@/domain/tenancy/payment';
import { formatDate, formatEuro } from '@/lib/format';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
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
      <Notice tone="success" title="Payment received" role="status">
        <p>
          {operatorName} received your {formatEuro(amounts.totalCents)} on{' '}
          {formatDate(tenancy.paymentReceivedAt)}. Thank you. They’ll be in touch about moving in.
        </p>
      </Notice>
    );
  }
  const rows: Array<[string, string]> = [
    ['Deposit', formatEuro(amounts.depositCents)],
    ['First month’s rent', formatEuro(amounts.firstRentCents)],
    ['To pay', formatEuro(amounts.totalCents)],
    ['By', tenancy.paymentDueDate ? formatDate(tenancy.paymentDueDate) : ''],
    ['Name on the account', payTo.accountName],
    ['IBAN', formatIban(payTo.iban)],
    ['Reference', tenancy.paymentReference ?? ''],
  ];
  return (
    <Stack gap={4}>
      <h2 className="type-title">Pay the deposit and first month’s rent</h2>
      <Card>
        <dl className={styles.answers}>
          {rows.map(([label, value]) => (
            <div key={label} className={styles.answer}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Notice tone="warning" title="Check the bank details by phone first">
        <p>
          Before you pay, call {operatorName} to confirm these details. We’ll never email you
          different ones. You pay {operatorName} directly; nothing is paid to Gaff, and there are no
          other fees.
        </p>
      </Notice>
      <p>Once the money arrives, {operatorName} confirms it here, and we’ll email you a receipt.</p>
    </Stack>
  );
}
