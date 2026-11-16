import Link from 'next/link';
import type { ReactNode } from 'react';
import { common, viewingCopy } from '@/copy/renter';
import { chosenDay, type ViewingDay, type ViewingTime } from '@/domain/viewings/choosing';
import type { RenterModel } from '@/server/renter/model';
import { Button, ButtonLink } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { TimePicker } from '@/ui/TimePicker';
import styles from '../renter.module.css';
import { bookAction, cancelAction } from './booking-actions';
import { Task } from './Task';

const copy = viewingCopy;

/**
 * R12, UX-RN-5: choosing a time, the way people know from Calendly: days with places as a short
 * row, and the chosen day's times as a list of large buttons. Tapping a time goes on to the
 * confirm step. Someone who already holds a viewing is choosing a new time for it (UX-RN-8).
 */
export function ChooseTime({
  token,
  model,
  day,
  gone,
}: {
  token: string;
  model: RenterModel;
  /** The day the address asks for, "2026-11-20". */
  day?: string | null;
  /** States: the time they chose was just taken. */
  gone?: boolean;
}) {
  const here = `/r/${token}`;
  const { days, booking } = model.viewings;
  const shown = chosenDay(days, day);
  const frame = (task: ReactNode, next: string) => (
    <PrivateFrame audience="renter" lister={model.lister} home={model.home} next={<p>{next}</p>}>
      {task}
    </PrivateFrame>
  );
  if (!shown) {
    return frame(
      <Task>
        <Outcome tone="info" title={copy.noTimes.title}>
          <p>{copy.noTimes.text(model.operator)}</p>
        </Outcome>
        {booking ? (
          <div className={styles.quietRow}>
            <ButtonLink href={here} variant="quiet">
              {copy.choose.keep}
            </ButtonLink>
          </div>
        ) : null}
      </Task>,
      copy.noTimes.next,
    );
  }
  return frame(
    <Task
      title={booking ? copy.choose.changeTitle : copy.choose.title}
      lead={booking ? copy.choose.changeLead(booking.when) : undefined}
    >
      {gone ? (
        <Notice tone="warning" role="alert">
          <p>{copy.choose.justGone}</p>
        </Notice>
      ) : null}
      <TimePicker
        daysLabel={copy.choose.days}
        days={days.map((each) => ({
          href: `${here}/book?day=${each.date}`,
          label: each.short,
          current: each.date === shown.date,
        }))}
        dayHeading={shown.label}
        times={shown.times.map((time) => ({
          href: `${here}/book?slot=${time.slotId}`,
          label: time.label,
          note: time.note,
        }))}
      />
      {booking ? (
        <div className={styles.quietRow}>
          <ButtonLink href={here} variant="quiet">
            {copy.choose.keep}
          </ButtonLink>
        </div>
      ) : null}
    </Task>,
    copy.choose.next,
  );
}

/**
 * UX-RN-7: the confirm step. The day, the time and the address, and one optional field: a mobile
 * number for a text reminder. It's asked once; a number they've given is shown with "Change";
 * a number that came with their enquiry is never filled in (Q12).
 */
export function ConfirmTime({
  token,
  model,
  chosen,
  problem,
  changeMobile,
}: {
  token: string;
  model: RenterModel;
  chosen: { day: ViewingDay; time: ViewingTime };
  /** A code for what went wrong when they pressed the button. */
  problem?: string;
  /** They asked to change the mobile number they gave. */
  changeMobile?: boolean;
}) {
  const here = `/r/${token}`;
  const { booking, reminderNumber } = model.viewings;
  const problems: Record<string, string> = copy.confirm.problems;
  const askMobile = changeMobile || (!booking && !reminderNumber);
  const said = problem ? problems[problem] : undefined;
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={<p>{booking ? copy.confirm.moveNext : copy.confirm.next}</p>}
    >
      <Task title={booking ? copy.confirm.changeTitle : copy.confirm.title}>
        <div className={styles.fact}>
          <p className={styles.factLine}>
            {chosen.day.label}, {chosen.time.label}
          </p>
          <p>{model.place}</p>
          {chosen.time.note ? <p className={styles.muted}>{chosen.time.note}</p> : null}
        </div>
        {said && problem !== 'phone' ? (
          <Notice tone="warning" role="alert">
            <p>{said}</p>
          </Notice>
        ) : null}
        <form action={bookAction.bind(null, token, chosen.time.slotId)} className={styles.task}>
          {askMobile ? (
            <TextField
              name="mobile"
              label={copy.confirm.mobileLabel}
              hint={copy.confirm.mobileHint}
              optional
              width="medium"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              defaultValue={changeMobile ? (reminderNumber ?? '') : ''}
              error={problem === 'phone' ? said : undefined}
            />
          ) : reminderNumber ? (
            <SummaryList
              rows={[
                {
                  label: copy.confirm.mobileGiven,
                  value: reminderNumber,
                  action: (
                    <Link
                      href={`${here}/book?slot=${chosen.time.slotId}&mobile=change`}
                      className={styles.lineLink}
                    >
                      {common.change}
                      <span className="visually-hidden"> the mobile number</span>
                    </Link>
                  ),
                },
              ]}
            />
          ) : null}
          <div className={styles.actions}>
            <SubmitButton fullWidth="phone" pendingLabel={copy.confirm.booking}>
              {booking ? copy.confirm.moveButton : copy.confirm.button}
            </SubmitButton>
            <ButtonLink
              href={`${here}/book?day=${chosen.day.date}`}
              variant="quiet"
              fullWidth="phone"
            >
              {copy.confirm.another}
            </ButtonLink>
          </div>
        </form>
      </Task>
    </PrivateFrame>
  );
}

/**
 * UX-RN-8: cancelling can't be undone (the place goes to the waiting list), so it has one screen
 * that says exactly what will happen, and never an "Are you sure?" over the page.
 */
export function CancelViewing({ token, model }: { token: string; model: RenterModel }) {
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={<p>{copy.cancel.next}</p>}
    >
      <Task title={copy.cancel.title}>
        <div className={styles.fact}>
          <p className={styles.factLine}>{model.viewings.booking?.when}</p>
          <p>{model.place}</p>
        </div>
        <form action={cancelAction.bind(null, token)} className={styles.actions}>
          <Button type="submit" variant="destructive" fullWidth="phone">
            {copy.cancel.button}
          </Button>
          <ButtonLink href={`/r/${token}`} variant="quiet" fullWidth="phone">
            {copy.cancel.keep}
          </ButtonLink>
        </form>
      </Task>
    </PrivateFrame>
  );
}
