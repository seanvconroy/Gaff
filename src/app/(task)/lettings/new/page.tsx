import type { Metadata } from 'next';
import { returnPath } from '@/domain/navigation/return-to';
import { irishToday } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { NewLettingForm } from './NewLettingForm';

export const metadata: Metadata = { title: 'Add a letting' };

/**
 * A focused task (UX-NV-6): it opens full screen, and closing it goes back to the page that
 * opened it (`?from=/today`), or to Lettings.
 */
export default async function NewLettingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const member = await requireMember();
  const { from } = await searchParams;
  return (
    <NewLettingForm
      forAgency={member.organisationKind === 'agency'}
      today={irishToday()}
      leaveTo={returnPath(from, '/lettings')}
    />
  );
}
