import Link from 'next/link';
import type { ReactNode } from 'react';
import { common, viewingCopy } from '@/copy/renter';
import { testCopyMobileCode } from '@/copy/test-copy';
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
import { MobileCodeForm } from './MobileCodeForm';
import {
  bookAction,
  cancelAction,
  confirmCodeAction,
  resendCodeAction,
  sendCodeAction,
} from './booking-actions';
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
 * UX-RN-7: the confirm step. The day, the time and the address.
 *
 * P16 (Q51): a new booking needs a mobile the renter confirms with a text code, so for someone
 * without one the step asks for it, and its button texts the code; the next screen takes the code
 * and books. A number they've confirmed is shown, masked, with "Change"; a number that came with
 * their enquiry is never filled in (Q12). Moving a booking asks nothing more.
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
  const problems = copy.confirm.problems;
  const askMobile = !booking && (changeMobile || !reminderNumber);
  const said = problem ? problems[problem] : undefined;
  const atField = problem === 'phone' || problem === 'too_soon' || problem === 'not_sent';
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
        {said && !(askMobile && atField) ? (
          <Notice tone="warning" role="alert">
            <p>{said}</p>
          </Notice>
        ) : null}
        <form
          action={
            askMobile
              ? sendCodeAction.bind(null, token, chosen.time.slotId)
              : bookAction.bind(null, token, chosen.time.slotId)
          }
          className={styles.task}
        >
          {askMobile ? (
            <TextField
              name="mobile"
              label={copy.confirm.mobileLabel}
              hint={copy.confirm.mobileHint}
              width="medium"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              error={atField ? said : undefined}
            />
          ) : reminderNumber && !booking ? (
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
            {askMobile ? (
              <SubmitButton fullWidth="phone" pendingLabel={copy.confirm.sending}>
                {copy.confirm.sendCode}
              </SubmitButton>
            ) : (
              <SubmitButton fullWidth="phone" pendingLabel={copy.confirm.booking}>
                {booking ? copy.confirm.moveButton : copy.confirm.button}
              </SubmitButton>
            )}
            {chosen.day.date ? (
              <ButtonLink
                href={`${here}/book?day=${chosen.day.date}`}
                variant="quiet"
                fullWidth="phone"
              >
                {copy.confirm.another}
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Task>
    </PrivateFrame>
  );
}

/**
 * P16: the code from the text. One field and one button, which confirms the mobile and books
 * the time (or takes the place from the waiting list). Under it, a new code, or another number.
 * Errors are said at the field. Where texts aren't sent (the test copy), the code is shown here.
 */
export function ConfirmCode({
  token,
  model,
  slotId,
  when,
  place,
  problem,
  sentAgain,
  codeOnScreen,
}: {
  token: string;
  model: RenterModel;
  slotId: string;
  /** "Friday 20 November, 6:15pm" */
  when: string;
  /** It's a place offered from the waiting list. */
  place: boolean;
  problem?: string;
  sentAgain?: boolean;
  /** The test copy only: the code that would have been texted. */
  codeOnScreen?: string | null;
}) {
  const here = `/r/${token}`;
  const masked = model.viewings.pendingMobile ?? '';
  const atField = problem ? copy.code.problems[problem] : undefined;
  const sending = problem ? copy.confirm.problems[problem] : undefined;
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={<p>{copy.confirm.next}</p>}
    >
      <Task title={copy.code.title} lead={copy.code.lead(masked)}>
        <div className={styles.fact}>
          <p className={styles.factLine}>{when}</p>
          <p>{model.place}</p>
        </div>
        {sentAgain ? (
          <Notice tone="info" role="status">
            <p>{copy.code.newCodeSent}</p>
          </Notice>
        ) : null}
        {sending ? (
          <Notice tone="warning" role="alert">
            <p>{sending}</p>
          </Notice>
        ) : null}
        {codeOnScreen ? <p>{testCopyMobileCode(codeOnScreen)}</p> : null}
        <MobileCodeForm
          action={confirmCodeAction.bind(null, token, slotId)}
          label={copy.code.label}
          button={place ? copy.code.placeButton : copy.code.button}
          pending={copy.confirm.booking}
          error={atField}
        />
        <div className={styles.quietRow}>
          <form action={resendCodeAction.bind(null, token, slotId)}>
            <SubmitButton variant="quiet" fullWidth="phone" pendingLabel={copy.confirm.sending}>
              {copy.code.newCode}
            </SubmitButton>
          </form>
          <ButtonLink
            href={`${here}/book?slot=${slotId}&mobile=change`}
            variant="quiet"
            fullWidth="phone"
          >
            {copy.code.changeNumber}
          </ButtonLink>
        </div>
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
