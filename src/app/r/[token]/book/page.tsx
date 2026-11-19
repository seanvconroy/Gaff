import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { chosenTime } from '@/domain/viewings/choosing';
import { ChooseTime, ConfirmCode, ConfirmTime } from '../Booking';
import { LinkEnded, loadRenter } from '../load';
import { mobileCodeCookie } from '../mobile-code';

export const metadata: Metadata = { title: 'Choose a time' };
export const dynamic = 'force-dynamic';

/**
 * R12, UX-RN-5 to UX-RN-8: booking a viewing, or moving one: a day, then a time, then confirm.
 * Each step has an address of its own (`?day=`, then `?slot=`), holding a date or a time's ID
 * and nothing about the person. Someone who can't book from here is sent to their own page.
 *
 * P16: a new booking confirms a mobile first, at the confirm step; then `&step=code` takes the
 * code from the text and books. A place offered from the waiting list comes here for its mobile
 * too, and has no picker.
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
    step?: string;
    sent?: string;
  }>;
}) {
  const { token } = await params;
  const { day, slot, gone, problem, mobile, step, sent } = await searchParams;
  const loaded = await loadRenter(token);
  if (!loaded) return <LinkEnded />;
  const { model } = loaded;
  const place = model.view === 'place_offered' ? model.viewings.place : null;
  const forPlace = Boolean(place && slot === place.slotId);
  if (!['invited', 'no_times', 'cancelled', 'booked'].includes(model.view) && !forPlace) {
    redirect(`/r/${token}`);
  }
  const chosen = slot ? chosenTime(model.viewings.days, slot) : null;
  if (slot && (chosen || forPlace) && step === 'code' && model.viewings.pendingMobile) {
    return (
      <ConfirmCode
        token={token}
        model={model}
        slotId={slot}
        when={forPlace ? place!.when : `${chosen!.day.label}, ${chosen!.time.label}`}
        place={forPlace}
        problem={problem}
        sentAgain={sent === 'again'}
        codeOnScreen={(await cookies()).get(mobileCodeCookie(token))?.value ?? null}
      />
    );
  }
  if (forPlace && place) {
    // P16: the place from the waiting list, as the one time there is to confirm.
    const [date, time] = splitWhen(place.when);
    return (
      <ConfirmTime
        token={token}
        model={model}
        chosen={{
          day: { date: '', label: date, short: date, times: [] },
          time: { slotId: place.slotId, startsAt: new Date(0), label: time, note: null },
        }}
        problem={problem}
        changeMobile={mobile === 'change'}
      />
    );
  }
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

/** "Friday 20 November, 6:15pm" → the day and the time, as the confirm step shows them. */
function splitWhen(when: string): [string, string] {
  const at = when.lastIndexOf(', ');
  return at === -1 ? [when, ''] : [when.slice(0, at), when.slice(at + 2)];
}
