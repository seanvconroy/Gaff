import type { Metadata } from 'next';
import { settingsCopy } from '@/copy/settings';
import { formatIban } from '@/domain/tenancy/payment';
import { hasPasskey } from '@/server/auth/confirm-request';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { loadSettings } from '../load';
import { PaymentAccountForm } from '../PaymentAccountForm';

export const metadata: Metadata = { title: 'Where tenants pay' };
export const dynamic = 'force-dynamic';

const copy = settingsCopy.payment;

/**
 * UX-ST-1, R23: where tenants pay. Its row shows in Settings once it's been set at the payment
 * step of the first tenancy (UX-TN-2). Changing it asks to confirm it's you, every time
 * (UX-SI-10, UX-TS-6).
 */
export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const { member, organisation } = await loadSettings();
  return (
    <Stack gap={8}>
      <PageHeader
        back={{ href: '/settings', label: settingsCopy.back }}
        title={copy.title}
        lead={copy.lead}
      />
      <Narrow>
        <Stack gap={6}>
          {saved ? (
            <Notice tone="success" role="status">
              <p>{settingsCopy.saved}</p>
            </Notice>
          ) : null}
          <PaymentAccountForm
            accountName={organisation.paymentAccountName ?? ''}
            iban={organisation.paymentIban ? formatIban(organisation.paymentIban) : ''}
            email={member.email}
            hasPasskey={await hasPasskey(member.userId)}
          />
        </Stack>
      </Narrow>
    </Stack>
  );
}
