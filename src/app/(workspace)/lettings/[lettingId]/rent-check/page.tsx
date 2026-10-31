import type { Metadata } from 'next';
import { irishToday } from '@/lib/format';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import { RentCheckForm } from './RentCheckForm';

export const metadata: Metadata = { title: 'Rent check' };

export default async function RentCheckPage({
  params,
}: {
  params: Promise<{ lettingId: string }>;
}) {
  const { letting, rentCheck } = await loadLetting(params);
  const euros = (cents: number) => (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  const current: Record<string, string> = {
    askingRent: euros(letting.monthlyRentCents),
    ...(rentCheck
      ? {
          lastLet: rentCheck.lastLet,
          ending: rentCheck.ending ?? '',
          substantialChange: rentCheck.substantialChange ? 'yes' : 'no',
          previousRent: rentCheck.previousRentCents ? euros(rentCheck.previousRentCents) : '',
          previousRentSetOn: rentCheck.previousRentSetOn ?? '',
        }
      : {}),
  };
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} section="Rent check" />
      <Notice tone="info" title="The rules from 1 March 2026">
        <p>
          Rent can be reset to market only in set cases. Otherwise it can rise by no more than
          inflation, up to 2% a year. Gaff works out which applies from your answers. It isn’t legal
          advice: if you’re unsure, ask your solicitor or the RTB.
        </p>
      </Notice>
      <RentCheckForm lettingId={letting.id} today={irishToday()} current={current} />
    </Stack>
  );
}
