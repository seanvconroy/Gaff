import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatIban, paymentAmounts } from '@/domain/tenancy/payment';
import { formatDate, formatEuro } from '@/lib/format';
import { LinkEnded, loadRenter } from '../load';
import { PayPage, type PayDetails } from '../Pay';

export const metadata: Metadata = { title: 'Pay the deposit and first month’s rent' };
export const dynamic = 'force-dynamic';

/**
 * R23, UX-RN-22, UX-RN-23, UX-SI-12: the tenant's payment page. It shows the lister's bank
 * details, so a link alone doesn't open it: the one-time code comes first, unless they're signed
 * in with the same email. Until payment has been asked for, there's nothing here to see.
 */
export default async function PayRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  const { page, model } = loaded;
  const tenancy = page.tenancy;
  if (model.view !== 'tenancy' || !tenancy?.paymentRequestedAt || !page.payTo) {
    redirect(`/r/${token}`);
  }
  let details: PayDetails | null = null;
  if (await loaded.isOpen()) {
    const amounts = paymentAmounts(tenancy);
    details = {
      total: formatEuro(amounts.totalCents),
      deposit: formatEuro(amounts.depositCents),
      firstRent: formatEuro(amounts.firstRentCents),
      payBy: tenancy.paymentDueDate ? formatDate(tenancy.paymentDueDate) : null,
      accountName: page.payTo.accountName,
      iban: formatIban(page.payTo.iban),
      reference: tenancy.paymentReference,
      receivedOn: tenancy.paymentReceivedAt ? formatDate(tenancy.paymentReceivedAt) : null,
    };
  }
  return <PayPage token={token} model={model} details={details} sentTo={loaded.sentTo} />;
}
