import type { Metadata } from 'next';
import { irishToday } from '@/lib/format';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
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
      <LettingHeader letting={letting} section="Who can view" />
      <Notice tone="info" title="Why only these four?">
        <p>
          Criteria must be fair to everyone and lawful, so they come from a fixed list. Gaff asks
          renters only what your criteria need, and ranks everyone the same way: by how many
          criteria they meet, then by when they enquired. Nobody is turned away by Gaff. You decide
          who views.
        </p>
      </Notice>
      <CriteriaForm lettingId={letting.id} today={irishToday()} current={current} />
    </Stack>
  );
}
