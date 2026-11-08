import type { Metadata } from 'next';
import { formatDate, formatEuro } from '@/lib/format';
import { rtbPack } from '@/server/tenancy/rtb';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SummaryList } from '@/ui/SummaryList';
import { loadLetting } from '../../letting';

export const metadata: Metadata = { title: 'RTB registration pack' };
export const dynamic = 'force-dynamic';

/**
 * R24 (Q24): what the RTB's registration asks for, in one place. No date of birth: Gaff never
 * collects one (rule 3), and the RTB doesn't require it.
 */
export default async function RtbPackPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { member, letting } = await loadLetting(params);
  const pack = await rtbPack(member, letting.id);
  if (!pack) return <p>There’s no tenancy for this home yet.</p>;
  const isAgency = pack.organisation.kind === 'agency';
  const rows: Array<[string, string]> = [
    ['Register by', formatDate(pack.deadline)],
    ['Home', `${pack.letting.addressLine1}, ${pack.letting.area}`],
    ['Bedrooms', String(pack.letting.bedrooms)],
    ['Tenancy start', formatDate(pack.tenancy.startDate)],
    ['Rent', `${formatEuro(pack.tenancy.rentCents)} a month`],
    ['Deposit', formatEuro(pack.tenancy.depositCents)],
    ['Landlord', isAgency ? (pack.landlordName ?? 'Not given') : pack.organisation.name],
    ...(isAgency
      ? ([
          ['Agent', pack.organisation.name],
          ['PSRA licence', pack.organisation.psraLicenceNumber ?? 'Not given'],
        ] as Array<[string, string]>)
      : []),
    ['Tenant', pack.tenant.fullName],
    ['Tenant’s email', pack.tenant.email],
    ['Tenant’s phone', pack.tenant.phone ?? 'Not given'],
    [
      'Tenant’s PPS number',
      pack.tenancy.rtbRegisteredAt
        ? 'Deleted after registration'
        : (pack.ppsn ?? 'Not given (optional)'),
    ],
  ];
  return (
    <Stack gap={6}>
      <h1 className="type-heading">RTB registration pack: {pack.letting.addressLine1}</h1>
      {pack.tenancy.rtbRegisteredAt ? (
        <Notice tone="success" title="Registered" role="status">
          <p>On {formatDate(pack.tenancy.rtbRegisteredAt)}.</p>
        </Notice>
      ) : (
        <Notice tone="info" title={`Register by ${formatDate(pack.deadline)}`}>
          <p>
            Register with the Residential Tenancies Board within one month of the tenancy starting,
            using the details below. The RTB also asks for each adult tenant’s date of birth if you
            have it; Gaff doesn’t collect it.
          </p>
        </Notice>
      )}
      <Card>
        <SummaryList rows={rows.map(([label, value]) => ({ label, value }))} />
      </Card>
    </Stack>
  );
}
