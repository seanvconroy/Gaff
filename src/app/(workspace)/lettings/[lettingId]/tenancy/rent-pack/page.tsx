import type { Metadata } from 'next';
import { formatDate, formatEuro, formatRent } from '@/lib/format';
import { rentSettingPack } from '@/server/tenancy/rtb';
import { Stack } from '@/ui/Layout';
import { Table } from '@/ui/Table';
import { loadLetting } from '../../letting';

export const metadata: Metadata = { title: 'Rent-setting pack' };
export const dynamic = 'force-dynamic';

const results: Record<string, string> = {
  market: 'The rent could be set at the market rate.',
  capped: 'The rent increase is capped.',
  get_advice: 'Advice was needed before setting the rent.',
};

/** R24: how the rent was set: the previous rent, the check, three comparables, the new rent. */
export default async function RentPackPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { member, letting } = await loadLetting(params);
  const pack = await rentSettingPack(member, letting.id);
  if (!pack) return null;
  return (
    <Stack gap={6}>
      <h1 className="type-heading">Rent-setting pack: {pack.letting.addressLine1}</h1>
      <p>
        {pack.letting.addressLine1}, {pack.letting.area}. New rent:{' '}
        {formatRent(pack.tenancy?.rentCents ?? pack.letting.monthlyRentCents)}
        {pack.tenancy ? `, from ${formatDate(pack.tenancy.startDate)}` : ''}.
      </p>
      <h2 className="type-title">Rent check</h2>
      {pack.check ? (
        <ul>
          <li>{results[pack.check.result] ?? pack.check.result}</li>
          <li>
            Previous rent:{' '}
            {pack.check.previousRentCents ? formatRent(pack.check.previousRentCents) : 'none'}
            {pack.check.previousRentSetOn
              ? `, set on ${formatDate(pack.check.previousRentSetOn)}`
              : ''}
          </li>
          <li>
            Checked on {formatDate(pack.check.checkedAt)} under Gaff’s rules version{' '}
            {pack.check.rulesVersion}. Not legal advice.
          </li>
        </ul>
      ) : (
        <p>No rent check recorded.</p>
      )}
      <h2 className="type-title">Three comparable rents (RTB Rent Register)</h2>
      {pack.comparables.length > 0 ? (
        <Table caption="Comparable rents" head={['Area', 'Home', 'Rent', 'Registered']}>
          {pack.comparables.map((c) => (
            <tr key={c.id}>
              <td>{c.area}</td>
              <td>
                {c.bedrooms}-bed {c.propertyType}
              </td>
              <td>{formatEuro(c.monthlyRentCents)} a month</td>
              <td>{c.registeredOn ? formatDate(c.registeredOn) : 'Not given'}</td>
            </tr>
          ))}
        </Table>
      ) : (
        <p>No comparables recorded. Add them on the letting’s overview.</p>
      )}
    </Stack>
  );
}
