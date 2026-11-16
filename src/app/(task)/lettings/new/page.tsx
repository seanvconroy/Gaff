import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { listAHomeHref } from '@/domain/navigation/context';
import { returnPath } from '@/domain/navigation/return-to';
import { irishToday } from '@/lib/format';
import { requirePerson } from '@/server/context/current-person';
import { NewLettingForm } from './NewLettingForm';

export const metadata: Metadata = { title: 'Add a letting' };

/**
 * A focused task (UX-NV-6): it opens full screen, and closing it goes back to the page that
 * opened it (`?from=/today`), or to Lettings.
 *
 * UX-AC-4, UX-AC-7: anyone signed in can add a home. Someone who lets nothing yet is a private
 * landlord in the making: they're asked nothing first, and their organisation of one is made
 * silently when the home is saved (`createLettingAction`). Only a name is needed, so someone
 * whose sign-in didn't supply one is asked for it, once, and comes straight back.
 */
export default async function NewLettingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const person = await requirePerson();
  if (!person.member && !person.nameKnown) {
    redirect(`/welcome?next=${encodeURIComponent(listAHomeHref)}`);
  }
  const { from } = await searchParams;
  return (
    <NewLettingForm
      forAgency={person.member?.organisationKind === 'agency'}
      today={irishToday()}
      leaveTo={returnPath(from, person.member ? '/lettings' : '/')}
    />
  );
}
