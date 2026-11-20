import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { addLettingCopy } from '@/copy/add-letting';
import { mayHaveDevelopments } from '@/domain/developments/development';
import { newDevelopmentHref } from '@/domain/developments/links';
import { fromOf, resumeHref } from '@/domain/lettings/links';
import { listAHomeHref } from '@/domain/navigation/context';
import { returnPath } from '@/domain/navigation/return-to';
import { requirePerson } from '@/server/context/current-person';
import { readingIsOffered } from '@/server/lettings/reader-setting';
import { listDrafts } from '@/server/lettings/drafts';
import { startAction } from '../_flow/actions';
import { StartStep } from '../_flow/Steps';

export const metadata: Metadata = { title: 'Add a letting' };

/**
 * Step 1 of adding a letting, "Tell Gaff about the home" (UX-LT-1). A focused task (UX-NV-6):
 * it opens full screen, and closing it goes back to the page that opened it (`?from=/today`),
 * or to Lettings.
 *
 * UX-AC-4, UX-AC-7: anyone signed in can add a home. Someone who lets nothing yet is a private
 * landlord in the making: they're asked nothing first, and their organisation of one is made
 * silently the first time something about the home is saved. Only a name is needed, so someone
 * whose sign-in didn't supply one is asked for it, once, and comes straight back.
 */
export default async function NewLettingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; draft?: string; kept?: string }>;
}) {
  const person = await requirePerson();
  if (!person.member && !person.nameKnown) {
    redirect(`/welcome?next=${encodeURIComponent(listAHomeHref)}`);
  }
  const { from, draft, kept } = await searchParams;
  const back = fromOf(from);
  const drafts = person.member ? await listDrafts(person.member) : [];
  // A draft that holds only an advert link so far (UX-LT-8): the screen carries on with it.
  const draftId = drafts.find((each) => each.id === draft)?.id ?? null;
  return (
    <StartStep
      frame={{ leaveHref: returnPath(from, person.member ? '/lettings' : '/') }}
      action={startAction.bind(null, draftId, back)}
      from={back}
      draftId={draftId}
      kept={kept === '1' && draftId !== null}
      readerOn={await readingIsOffered()}
      several={
        person.member && mayHaveDevelopments(person.member.organisationKind)
          ? newDevelopmentHref
          : undefined
      }
      drafts={drafts
        .filter((each) => each.id !== draftId)
        .map((each) => ({
          id: each.id,
          label: each.addressLine1 ?? addLettingCopy.start.draftWithoutAddress,
          href: resumeHref(each.id, back),
        }))}
    />
  );
}
