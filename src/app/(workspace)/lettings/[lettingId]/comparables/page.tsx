import type { Metadata } from 'next';
import { irishToday } from '@/lib/format';
import { Narrow, Stack } from '@/ui/Layout';
import { loadLetting } from '../letting';
import { TaskHeader } from '../LettingHeader';
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
      <TaskHeader
        letting={letting}
        title="Comparable rents"
        lead={`Three homes like ${letting.addressLine1} from the RTB Rent Register on rtb.ie: the same type, a similar size, in the same area. Gaff keeps them for the rent-setting pack you give the new tenant.`}
      />
      <Narrow>
        <ComparablesForm lettingId={letting.id} today={irishToday()} current={current} />
      </Narrow>
    </Stack>
  );
}
