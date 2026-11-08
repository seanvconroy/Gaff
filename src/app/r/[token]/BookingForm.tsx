'use client';

import { useActionState, useState } from 'react';
import { testCopyMobileCode } from '@/copy/test-copy';
import { emptyFormState, type FormState } from '@/lib/forms';
import { buttonClass } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export interface BookingDay {
  day: string;
  slots: { id: string; time: string; when: string; places: string | null }[];
}

/**
 * R12, P16: two steps on one card. Choose a time and give a mobile; then the code from the
 * text books it. Someone moving their viewing, or whose mobile is already confirmed, books in
 * one step, and so does someone without a mobile.
 */
export function BookingForm({
  days,
  moving,
  confirmedMobile,
  choose,
  confirm,
}: {
  days: BookingDay[];
  moving: boolean;
  confirmedMobile: string | null;
  choose: Action;
  confirm: Action;
}) {
  const [chosen, sendChoice] = useActionState(choose, emptyFormState);
  const [checked, sendCode] = useActionState(confirm, emptyFormState);
  // "Change the number or time" sets this answer aside, until the next one comes back.
  const [setAside, setSetAside] = useState<FormState | null>(null);
  const codeSent = chosen.message === 'sent' && setAside !== chosen;
  const needsMobile = !moving && !confirmedMobile;

  if (codeSent) {
    // The latest choice wins over an earlier code attempt's values.
    const values = { ...checked.values, ...chosen.values };
    const when = days.flatMap((d) => d.slots).find((s) => s.id === values.slotId)?.when;
    return (
      <Stack gap={4}>
        <form key={checked.attempt ?? 'code'} action={sendCode} noValidate>
          <Stack gap={6}>
            <div className={styles.sectionHead}>
              <h2 className="type-title">Confirm your mobile</h2>
              <p role="status">
                We’ve texted a 6-digit code to {values.masked}. It works for 10 minutes. Enter it to
                book {when ?? 'your viewing'}.
              </p>
            </div>
            {chosen.values?.testCode ? <p>{testCopyMobileCode(chosen.values.testCode)}</p> : null}
            {chosen.errors?.mobile ? (
              <Notice tone="warning" role="alert">
                <p>{chosen.errors.mobile}</p>
              </Notice>
            ) : null}
            <input type="hidden" name="slotId" value={values.slotId ?? ''} />
            <input type="hidden" name="mobile" value={values.mobile ?? ''} />
            <input type="hidden" name="masked" value={values.masked ?? ''} />
            <TextField
              name="code"
              label="The code from the text"
              inputMode="numeric"
              autoComplete="one-time-code"
              width="short"
              error={checked.errors?.code}
            />
            <SubmitButton fullWidth pendingLabel="Booking…">
              Confirm and book
            </SubmitButton>
          </Stack>
        </form>
        <form action={sendChoice}>
          <input type="hidden" name="slotId" value={values.slotId ?? ''} />
          <input type="hidden" name="mobile" value={values.mobile ?? ''} />
          <input type="hidden" name="masked" value={values.masked ?? ''} />
          <input type="hidden" name="resend" value="yes" />
          <SubmitButton variant="quiet" fullWidth name="how" value="code" pendingLabel="Sending…">
            Text me a new code
          </SubmitButton>
        </form>
        <button
          type="button"
          className={buttonClass('quiet', true)}
          onClick={() => setSetAside(chosen)}
        >
          Change the number or the time
        </button>
      </Stack>
    );
  }

  const values = chosen.values ?? {};
  return (
    <form key={chosen.attempt ?? 'first'} action={sendChoice} noValidate>
      <Stack gap={6}>
        <div className={styles.sectionHead}>
          <h2 className="type-title">
            {moving ? 'Change to another time' : 'Choose a time to view'}
          </h2>
          <p>
            {moving
              ? 'Pick a new time, and your old one goes to someone else.'
              : 'Pick a time that suits you. We’ll email you to confirm it straight away, and remind you the day before.'}
          </p>
        </div>
        {chosen.errors?.slotId ? (
          <Notice tone="warning" role="alert">
            <p>{chosen.errors.slotId}</p>
          </Notice>
        ) : null}
        {days.map(({ day, slots }) => (
          <fieldset key={day} className={styles.day}>
            <legend className="type-title">{day}</legend>
            <div className={styles.slots}>
              {slots.map((slot) => (
                <label key={slot.id} className={styles.slot}>
                  <input
                    type="radio"
                    name="slotId"
                    value={slot.id}
                    defaultChecked={values.slotId === slot.id}
                  />
                  <span className={styles.slotText}>
                    <span className={styles.slotTime}>{slot.time}</span>
                    {slot.places ? <span className={styles.muted}>{slot.places}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {needsMobile ? (
          <TextField
            name="mobile"
            label="Your mobile number"
            hint="We’ll text you a code to confirm it, and a reminder two hours before your viewing."
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            defaultValue={values.mobile}
            error={chosen.errors?.mobile}
          />
        ) : null}
        {confirmedMobile && !moving ? (
          <p>We’ll text {confirmedMobile} two hours before your viewing.</p>
        ) : null}
        <Stack gap={3}>
          <SubmitButton
            fullWidth
            name="how"
            value={needsMobile ? 'code' : 'book'}
            pendingLabel={needsMobile ? 'Sending…' : 'Booking…'}
          >
            {moving ? 'Move my viewing' : needsMobile ? 'Text me a code' : 'Book this time'}
          </SubmitButton>
          {needsMobile ? (
            <SubmitButton variant="quiet" fullWidth name="how" value="book">
              Book without a mobile
            </SubmitButton>
          ) : null}
        </Stack>
      </Stack>
    </form>
  );
}
