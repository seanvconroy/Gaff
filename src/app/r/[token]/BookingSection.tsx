import { bookableSlots, placesLeft } from '@/domain/viewings/booking';
import { maskMobile } from '@/domain/verification/mobile';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import type { loadRenterPage } from '@/server/renter/answers';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { cancelAction, chooseTimeAction, confirmBookingAction } from './booking-actions';
import { BookingForm, type BookingDay } from './BookingForm';

type Page = NonNullable<Awaited<ReturnType<typeof loadRenterPage>>>;

const problems: Record<string, string> = {
  choose: 'Choose a time first.',
  full: 'Sorry, that time has just been taken. Please choose another.',
  too_late: 'That time is about to start, so it can’t be booked now. Please choose another.',
  not_invited: 'This viewing can’t be booked from this link.',
  link: 'This link isn’t working any more. Reply to our email and we’ll help.',
};

/** R12, P16: choose a time, or change or cancel it. Phone-first, one thing to do. */
export function BookingSection({
  page,
  token,
  problem,
}: {
  page: Page;
  token: string;
  problem?: string;
}) {
  const available = bookableSlots(page.slots, new Date());
  const bookingDays: BookingDay[] = [...new Set(available.map((s) => formatDate(s.startsAt)))].map(
    (day) => ({
      day,
      slots: available
        .filter((s) => formatDate(s.startsAt) === day)
        .map((slot) => ({
          id: slot.id,
          time: formatTime(slot.startsAt),
          when: formatDateTime(slot.startsAt),
          places: slot.capacity > 1 ? `Group viewing, ${placesLeft(slot)} places left` : null,
        })),
    }),
  );
  const { booking, offer } = page;
  // P16: a mobile confirmed for this application gets the reminder without a new code.
  const confirmedMobile =
    page.application.mobileConfirmedAt && page.application.phoneE164
      ? maskMobile(page.application.phoneE164)
      : null;
  return (
    <Stack gap={6}>
      {problem && problems[problem] ? (
        <Notice tone="warning" role="alert">
          <p>{problems[problem]}</p>
        </Notice>
      ) : null}
      {booking ? (
        <Card>
          <div className={styles.sectionHead}>
            <h2 className="type-title">Your viewing</h2>
            <p className={styles.big}>{formatDateTime(booking.slot.startsAt)}</p>
          </div>
          <p>
            We’ll remind you the day before. If you can’t make it, please change or cancel, so
            someone else can have the place.
          </p>
          <form action={cancelAction.bind(null, token)}>
            <SubmitButton variant="secondary" fullWidth pendingLabel="Cancelling…">
              Cancel my viewing
            </SubmitButton>
          </form>
        </Card>
      ) : null}
      {available.length === 0 && !booking ? (
        <Notice tone="info" title="No times left">
          <p>All the viewing times are booked. Reply to our email and we’ll see what we can do.</p>
        </Notice>
      ) : null}
      {offer && !booking ? (
        <Notice tone="info" title="A place has opened up">
          <p>
            {offer.mode === 'one_at_a_time' && offer.expiresAt
              ? `It’s held for you until ${formatDateTime(offer.expiresAt)}. After that, it goes to the next person on the waiting list.`
              : 'It’s been offered to everyone on the waiting list, so the first person to book it gets it.'}
          </p>
        </Notice>
      ) : null}
      {available.length > 0 ? (
        <BookingForm
          days={bookingDays}
          moving={Boolean(booking)}
          confirmedMobile={confirmedMobile}
          choose={chooseTimeAction.bind(null, token)}
          confirm={confirmBookingAction.bind(null, token)}
        />
      ) : null}
    </Stack>
  );
}
