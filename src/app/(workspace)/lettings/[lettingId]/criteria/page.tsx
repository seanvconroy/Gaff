import type { Metadata } from 'next';
import { irishToday } from '@/lib/format';
import { Disclosure } from '@/ui/Disclosure';
import { Narrow, Stack } from '@/ui/Layout';
import { loadLetting } from '../letting';
import { TaskHeader } from '../LettingHeader';
import { CriteriaForm } from './CriteriaForm';

export const metadata: Metadata = { title: 'Who can view' };

export default async function CriteriaPage({ params }: { params: Promise<{ lettingId: string }> }) {
  const { letting } = await loadLetting(params);
  const criteria = letting.criteria;
  const current: Record<string, string> = criteria
    ? {
        moveInBy: criteria.moveInBy ?? '',
        minStayMonths: criteria.minStayMonths ? String(criteria.minStayMonths) : '',
        maxOccupants: criteria.maxOccupants ? String(criteria.maxOccupants) : '',
        pets: criteria.noPets ? 'no_pets' : 'considered',
      }
    : {};

  return (
    <Stack gap={8}>
      <TaskHeader
        letting={letting}
        title="Who can view"
        lead="Gaff asks renters only what these need, and ranks everyone the same way. Leave any of them out if it doesn’t matter for this home."
      />
      <Narrow>
        <Disclosure summary="Why only these four?">
          <p>
            Criteria must be fair to everyone and lawful, so they come from a fixed list. Gaff asks
            renters only what your criteria need, and ranks everyone the same way: by how many
            criteria they meet, then by when they enquired. Nobody is turned away by Gaff. You
            decide who views.
          </p>
        </Disclosure>
        <CriteriaForm lettingId={letting.id} today={irishToday()} current={current} />
      </Narrow>
    </Stack>
  );
}
