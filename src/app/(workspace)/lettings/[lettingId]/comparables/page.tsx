import type { Metadata } from 'next';
import { irishToday } from '@/lib/format';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import { ComparablesForm } from './ComparablesForm';

export const metadata: Metadata = { title: 'Comparable rents' };

export default async function ComparablesPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { letting, comparables } = await loadLetting(params);
  const current: Record<string, string> = {};
  for (const c of comparables) {
    current[`c${c.position}Area`] = c.area;
    current[`c${c.position}PropertyType`] = c.propertyType;
    current[`c${c.position}Bedrooms`] = String(c.bedrooms);
    current[`c${c.position}Rent`] = (c.monthlyRentCents / 100).toString();
    current[`c${c.position}RegisteredOn`] = c.registeredOn ?? '';
  }
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} section="Comparable rents" />
      <Notice tone="info" title="Three similar homes from the RTB Rent Register">
        <p>
          Search the Rent Register on rtb.ie for homes like {letting.addressLine1}: the same type, a
          similar size, in the same area. Gaff keeps them for the rent-setting pack you give the new
          tenant.
        </p>
      </Notice>
      <ComparablesForm lettingId={letting.id} today={irishToday()} current={current} />
    </Stack>
  );
}
