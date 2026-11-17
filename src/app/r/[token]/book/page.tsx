import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { chosenTime } from '@/domain/viewings/choosing';
import { ChooseTime, ConfirmTime } from '../Booking';
import { LinkEnded, loadRenter } from '../load';

export const metadata: Metadata = { title: 'Choose a time' };
export const dynamic = 'force-dynamic';

/**
 * R12, UX-RN-5 to UX-RN-8: booking a viewing, or moving one: a day, then a time, then confirm.
 * Each step has an address of its own (`?day=`, then `?slot=`), holding a date or a time's ID
 * and nothing about the person. Someone who can't book from here is sent to their own page.
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    day?: string;
    slot?: string;
    gone?: string;
    problem?: string;
    mobile?: string;
  }>;
}) {
  const { token } = await params;
  const { day, slot, gone, problem, mobile } = await searchParams;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  const { model } = loaded;
  if (!['invited', 'no_times', 'cancelled', 'booked'].includes(model.view)) {
    redirect(`/r/${token}`);
  }
  const chosen = slot ? chosenTime(model.viewings.days, slot) : null;
  if (chosen) {
    return (
      <ConfirmTime
        token={token}
        model={model}
        chosen={chosen}
        problem={problem}
        changeMobile={mobile === 'change'}
      />
    );
  }
  // States: the time they chose was just taken. They see the others.
  return <ChooseTime token={token} model={model} day={day} gone={Boolean(gone) || Boolean(slot)} />;
}
