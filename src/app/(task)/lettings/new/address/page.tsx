import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { addressSearch } from '@/adapters/address';
import { fromOf, startHref } from '@/domain/lettings/links';
import { listAHomeHref } from '@/domain/navigation/context';
import { returnPath } from '@/domain/navigation/return-to';
import { requirePerson } from '@/server/context/current-person';
import { saveStepAction } from '../../_flow/actions';
import { AddressStep } from '../../_flow/Steps';

export const metadata: Metadata = { title: 'Where is it?' };

/**
 * "Where is it?" for a home nothing has been saved about yet: "Fill it in myself" comes here.
 * There is no draft, so no ID, until this step is answered; from then on the home's steps live
 * at `/lettings/<id>/setup/<step>`.
 */
export default async function FirstAddressPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const person = await requirePerson();
  if (!person.member && !person.nameKnown) {
    redirect(`/welcome?next=${encodeURIComponent(listAHomeHref)}`);
  }
  const { from } = await searchParams;
  const back = fromOf(from);
  return (
    <AddressStep
      frame={{
        leaveHref: returnPath(from, person.member ? '/lettings' : '/'),
        backHref: startHref(back),
        step: 'address',
        exit: true,
      }}
      action={saveStepAction.bind(null, 'address', null, back)}
      values={{}}
      searchOn={addressSearch().name !== 'off'}
    />
  );
}
