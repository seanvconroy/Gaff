import { bookableSlots, placesLeft } from '@/domain/viewings/booking';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import type { loadRenterPage } from '@/server/renter/answers';
import { TextField } from '@/ui/Field';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { bookAction, cancelAction } from './booking-actions';

type Page = NonNullable<Awaited<ReturnType<typeof loadRenterPage>>>;

const problems: Record<string, string> = {
  choose: 'Choose a time first.',
  full: 'Sorry, that time has just been taken. Please choose another.',
  too_late: 'That time is about to start, so it can’t be booked now. Please choose another.',
  phone: 'That mobile number doesn’t look right. Check it, or leave it blank.',
  not_invited: 'This viewing can’t be booked from this link.',
  link: 'This link isn’t working any more. Reply to our email and we’ll help.',
};

/** R12: choose a time, or change or cancel it. Phone-first, one thing to do. */
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
  const days = [...new Set(available.map((s) => formatDate(s.startsAt)))];
  const { booking, offer } = page;
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
        <form action={bookAction.bind(null, token)}>
          <Stack gap={6}>
            <div className={styles.sectionHead}>
              <h2 className="type-title">
                {booking ? 'Change to another time' : 'Choose a time to view'}
              </h2>
              <p>
                {booking
                  ? 'Pick a new time, and your old one goes to someone else.'
                  : 'Pick a time that suits you. We’ll email you to confirm it straight away, and remind you the day before.'}
              </p>
            </div>
            {days.map((day) => (
              <fieldset key={day} className={styles.day}>
                <legend className="type-title">{day}</legend>
                <div className={styles.slots}>
                  {available
                    .filter((s) => formatDate(s.startsAt) === day)
                    .map((slot) => (
                      <label key={slot.id} className={styles.slot}>
                        <input type="radio" name="slotId" value={slot.id} />
                        <span className={styles.slotText}>
                          <span className={styles.slotTime}>{formatTime(slot.startsAt)}</span>
                          {slot.capacity > 1 ? (
                            <span className={styles.muted}>
                              Group viewing, {placesLeft(slot)} places left
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                </div>
              </fieldset>
            ))}
            {!booking ? (
              <TextField
                name="mobile"
                label="Mobile number for a text reminder"
                hint="We’ll text you two hours before. Leave it blank if you’d rather not."
                optional
                type="tel"
                autoComplete="tel"
                inputMode="tel"
              />
            ) : null}
            <SubmitButton fullWidth pendingLabel="Booking…">
              {booking ? 'Move my viewing' : 'Book this time'}
            </SubmitButton>
          </Stack>
        </form>
      ) : null}
    </Stack>
  );
}
