import { CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { keepCopy } from '@/copy/profile';
import {
  answersSentCopy,
  applyCopy,
  checksCopy,
  closedCopy,
  common,
  notices,
  offerCopy,
  questionsCopy,
  tenancyCopy,
  viewingCopy,
} from '@/copy/renter';
import { formatDate, irishToday } from '@/lib/format';
import type { RenterModel } from '@/server/renter/model';
import { ButtonLink, buttonProps } from '@/ui/Button';
import { DirectionsLink } from '@/ui/DirectionsLink';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { StepList } from '@/ui/StepList';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import styles from '../renter.module.css';
import { takePlaceAction } from './booking-actions';
import { ChecksTask } from './Checks';
import type { DocumentsPage } from '@/server/documents/renter';
import type { IdentityView } from './KeptIdentity';
import { respondAction } from './offer-actions';
import { PpsStep } from './PpsStep';
import { QuestionsFlow } from './QuestionsFlow';
import { Task } from './Task';

export interface HubOptions {
  /** The screen of a one-per-screen flow the address asks for (`?q=`). Never an answer. */
  q?: string | null;
  /** They asked to change their answers. */
  changing?: boolean;
  /** The guarded pages are open in this browser (UX-RN-14). */
  open: boolean;
  /** Where a one-time code would go, with most of the address hidden. */
  sentTo: string;
  /** A code for something that just went wrong, said once at the task. */
  checkProblem?: string;
  offerProblem?: string;
  /** UX-PF-12, UX-PF-14: a code for what went wrong using a kept ID check, said once. */
  idProblem?: string;
  /** Q35: the renter's verified identity at their checks (`IdentityView`). */
  identity?: IdentityView | null;
  /**
   * BA-16: their work and income documents, at that check, and the ID check's name and date as
   * the share screen shows it (P39).
   */
  documents?: {
    view: DocumentsPage;
    identity: { name: string; on: string } | null;
  } | null;
  /** BA-16: a code for a document that couldn't be added, said once (without a script). */
  documentProblem?: string;
  /**
   * UX-RN-13: they ticked "Keep my details for next time" and came back from its code: whether
   * the details were kept.
   */
  kept?: 'yes' | 'no' | null;
  /**
   * UX-PF-3: kept answers offered back on the questions, as the form takes them, for the
   * questions this home asks. They fill the answers in; the renter confirms or changes each.
   */
  offeredAnswers?: Record<string, string> | null;
}

/**
 * R9, UX-PP-7: the renter's own page. One link from the first reply to move-in, and it always
 * shows where they stand now: one task or one thing to know, one primary button, then what
 * happens next (UX-PP-1, UX-PP-2). Which page it is comes from `renterView`; the words from
 * src/copy/renter.ts.
 */
export function RenterHub({
  token,
  model,
  options,
}: {
  token: string;
  model: RenterModel;
  options: HubOptions;
}) {
  const here = `/r/${token}`;
  const { operator, view } = model;
  const keptNote =
    options.kept === 'yes' ? (
      <Notice tone="success" title={keepCopy.done} role="status">
        <p>
          {keepCopy.doneNext}{' '}
          <Link href="/enquiries" className={styles.lineLink}>
            {keepCopy.enquiries}
          </Link>
        </p>
      </Notice>
    ) : options.kept === 'no' ? (
      <Notice tone="info" role="status">
        <p>{keepCopy.notKept}</p>
      </Notice>
    ) : null;
  const page = (task: ReactNode, next?: ReactNode) => (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={typeof next === 'string' ? <p>{next}</p> : next}
    >
      {keptNote}
      {task}
    </PrivateFrame>
  );
  const deletion = (
    <p data-notice="deletion">
      {model.deleteBy ? notices.deletedBy(model.deleteBy) : closedCopy.noDate}
    </p>
  );

  // UX-RN-2: the questions, for someone who hasn't answered, or who asked to change an answer.
  const canAnswer = model.questions.canChange && model.questions.asked.length > 0;
  if (view === 'questions' || (view === 'answers_sent' && options.changing && canAnswer)) {
    return page(
      <QuestionsFlow
        token={token}
        asked={model.questions.asked}
        criteria={model.questions.criteria}
        moveInBy={
          model.questions.criteria.moveInBy ? formatDate(model.questions.criteria.moveInBy) : ''
        }
        today={irishToday()}
        lead={
          options.offeredAnswers
            ? `${questionsCopy.lead(model.firstName, operator)} ${keepCopy.fromProfile}`
            : questionsCopy.lead(model.firstName, operator)
        }
        current={
          options.offeredAnswers
            ? { ...options.offeredAnswers, ...model.questions.values }
            : model.questions.values
        }
        startAt={options.q}
        fromStart={options.changing || Boolean(options.offeredAnswers)}
        offered={Boolean(options.offeredAnswers)}
      />,
      questionsCopy.next(operator, model.viewings.first),
    );
  }

  switch (view) {
    case 'answers_sent':
      return page(
        <Task>
          <Outcome tone="success" title={common.thanks(model.firstName)} role="status">
            <p>
              {model.questions.answers.length > 0
                ? answersSentCopy.text(operator)
                : answersSentCopy.nothingAsked(operator)}
            </p>
          </Outcome>
          {model.questions.answers.length > 0 ? (
            <section className={styles.group} aria-labelledby="your-answers">
              <h3 id="your-answers" className="type-heading">
                {answersSentCopy.yourAnswers}
              </h3>
              {/* UX-MT-11: each answer beside what the home is for, without judgement. */}
              {model.questions.beside.length > 0 ? (
                <div className={styles.group} data-beside="">
                  {model.questions.beside.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ) : (
                <SummaryList layout="split" rows={model.questions.answers} />
              )}
              {canAnswer ? (
                <p>
                  <Link href={`${here}?change=answers`} className={styles.lineLink}>
                    {answersSentCopy.change}
                  </Link>
                </p>
              ) : null}
            </section>
          ) : null}
        </Task>,
        answersSentCopy.next(operator, model.viewings.first),
      );

    case 'invited':
      return page(
        <Task title={viewingCopy.invited.title} lead={viewingCopy.invited.text}>
          <div className={styles.actions}>
            <ButtonLink href={`${here}/book`} variant="primary" fullWidth="phone">
              {viewingCopy.invited.button}
            </ButtonLink>
          </div>
        </Task>,
        viewingCopy.invited.next,
      );

    case 'no_times':
      return page(
        <Outcome tone="info" title={viewingCopy.noTimes.title}>
          <p>{viewingCopy.noTimes.text(operator)}</p>
        </Outcome>,
        viewingCopy.noTimes.next,
      );

    case 'cancelled':
      return page(
        <Task>
          <Outcome tone="info" title={viewingCopy.cancelled.title} role="status">
            <p>{viewingCopy.cancelled.text}</p>
          </Outcome>
          <div className={styles.actions}>
            <ButtonLink href={`${here}/book`} variant="primary" fullWidth="phone">
              {viewingCopy.cancelled.button}
            </ButtonLink>
          </div>
        </Task>,
        viewingCopy.cancelled.next,
      );

    case 'booked':
      return page(
        <Task>
          <Outcome tone="success" title={viewingCopy.booked.title} role="status">
            <p className={styles.factLine}>{model.viewings.booking?.when}</p>
            <p>{model.place}</p>
          </Outcome>
          <div className={styles.actions}>
            {/* A calendar file: a plain link, so the phone's own calendar opens it. */}
            <a href={`${here}/viewing.ics`} {...buttonProps('primary', 'phone')}>
              <CalendarPlus size={20} strokeWidth={1.75} aria-hidden="true" />
              {viewingCopy.booked.calendar}
            </a>
            <DirectionsLink address={model.place} fullWidth="phone">
              {viewingCopy.booked.directions}
            </DirectionsLink>
          </div>
          <div className={styles.quietRow}>
            <ButtonLink href={`${here}/book`} variant="quiet">
              {viewingCopy.booked.change}
            </ButtonLink>
            <ButtonLink href={`${here}/cancel`} variant="quiet">
              {viewingCopy.booked.cancel}
            </ButtonLink>
          </div>
        </Task>,
        viewingCopy.booked.next(model.viewings.reminderNumber !== null),
      );

    case 'waiting_list':
      return page(
        <Outcome tone="waiting" title={viewingCopy.waitingList.title}>
          <p>{viewingCopy.waitingList.text}</p>
        </Outcome>,
        viewingCopy.waitingList.next,
      );

    case 'hold_ran_out':
      return page(
        <Outcome tone="waiting" title={viewingCopy.holdRanOut.title}>
          <p>{viewingCopy.holdRanOut.text}</p>
        </Outcome>,
        viewingCopy.waitingList.next,
      );

    case 'place_offered': {
      // UX-RN-6: one time on offer, so no picker: the page states it and the button takes it.
      const place = model.viewings.place!;
      return page(
        <Task title={viewingCopy.place.title}>
          <div className={styles.fact}>
            <p className={styles.factLine}>{place.when}</p>
            <p>{place.held ? viewingCopy.place.held(place.held) : viewingCopy.place.open}</p>
          </div>
          <form action={takePlaceAction.bind(null, token, place.slotId)} className={styles.actions}>
            <SubmitButton fullWidth="phone" pendingLabel={viewingCopy.place.taking}>
              {viewingCopy.place.button}
            </SubmitButton>
          </form>
        </Task>,
        place.held ? viewingCopy.place.next : viewingCopy.place.openNext,
      );
    }

    case 'not_invited_yet':
      return page(
        <Outcome tone="info" title={viewingCopy.notInvitedYet.title(operator)}>
          <p>{viewingCopy.notInvitedYet.text}</p>
        </Outcome>,
        viewingCopy.notInvitedYet.next(model.viewings.last),
      );

    case 'missed_viewing':
      return page(
        <Outcome tone="info" title={viewingCopy.missed.title}>
          <p>{viewingCopy.missed.text(operator)}</p>
        </Outcome>,
        viewingCopy.missed.next,
      );

    case 'after_viewing':
      return page(
        <Task title={applyCopy.invite.title} lead={applyCopy.invite.text}>
          <div className={styles.actions}>
            <ButtonLink href={`${here}/apply`} variant="primary" fullWidth="phone">
              {applyCopy.invite.button}
            </ButtonLink>
          </div>
        </Task>,
        applyCopy.invite.next(operator),
      );

    case 'applied':
      return page(
        <Task>
          <Outcome tone="success" title={applyCopy.applied.title} role="status">
            <p>{applyCopy.applied.text(operator)}</p>
          </Outcome>
          <p>
            <Link href={`${here}/apply`} className={styles.lineLink}>
              {applyCopy.applied.change}
            </Link>
          </p>
        </Task>,
        applyCopy.applied.next(operator),
      );

    case 'checks':
      return page(
        <ChecksTask token={token} model={model} options={options} />,
        model.checks.next === null || !options.open
          ? checksCopy.next(operator)
          : `${checksCopy.startNext} ${checksCopy.next(operator)}`,
      );

    case 'offer': {
      const offer = model.offer!;
      return page(
        <Task title={offerCopy.title(model.address)} lead={offerCopy.text(operator)}>
          {options.offerProblem && offerCopy.problems[options.offerProblem] ? (
            <Notice tone="warning" role="alert">
              <p>{offerCopy.problems[options.offerProblem]}</p>
            </Notice>
          ) : null}
          <SummaryList
            layout="split"
            rows={[
              { label: offerCopy.rent, value: offer.rent },
              { label: offerCopy.from, value: offer.from },
            ]}
          />
          <section className={styles.group} aria-labelledby="to-pay">
            <div className={styles.fact}>
              <h3 id="to-pay" className="type-heading">
                {offerCopy.total}
              </h3>
              <p className={styles.total}>{offer.total}</p>
            </div>
            <SummaryList
              layout="split"
              rows={[
                { label: offerCopy.deposit, value: offer.deposit },
                { label: offerCopy.firstRent, value: offer.firstRent },
              ]}
            />
            <p data-notice="fees">{notices.noOtherFees(operator)}</p>
          </section>
          <p className={styles.factLine}>{offerCopy.deadline(offer.deadline)}</p>
          <div className={styles.actions}>
            <form action={respondAction.bind(null, token, 'accept')}>
              <SubmitButton fullWidth="phone" pendingLabel={offerCopy.accepting}>
                {offerCopy.accept}
              </SubmitButton>
            </form>
            <ButtonLink href={`${here}/decline`} variant="quiet" fullWidth="phone">
              {offerCopy.decline}
            </ButtonLink>
          </div>
        </Task>,
        offerCopy.next(operator),
      );
    }

    case 'offer_closed':
      return page(
        <Outcome tone="info" title={offerCopy.closed.title} role="status">
          <p>{offerCopy.closed.text(operator)}</p>
        </Outcome>,
        deletion,
      );

    case 'offer_declined':
      return page(
        <Outcome tone="info" title={offerCopy.declined.title} role="status">
          <p>{offerCopy.declined.text}</p>
        </Outcome>,
        deletion,
      );

    case 'tenancy':
      return <TenancyHub token={token} model={model} />;

    case 'let_to_someone_else':
      return page(
        <Outcome tone="info" title={closedCopy.let(model.address)} role="status">
          <p>
            {closedCopy.letText(operator)} {closedCopy.thanks}
          </p>
        </Outcome>,
        deletion,
      );

    case 'home_closed':
      return page(
        <Outcome tone="info" title={closedCopy.withdrawn(model.address)} role="status">
          <p>
            {closedCopy.withdrawnText(operator)} {closedCopy.thanks}
          </p>
        </Outcome>,
        deletion,
      );

    case 'withdrawn':
    default:
      return page(
        <Outcome tone="info" title={closedCopy.withdrawnApplication.title}>
          <p>{closedCopy.withdrawnApplication.text(operator)}</p>
        </Outcome>,
        deletion,
      );
  }
}

/**
 * UX-RN-21 to UX-RN-26: the tenant's page. The three steps as a short list, always matching the
 * operator's (UX-RN-26), and under it the next step's one task and button.
 */
function TenancyHub({ token, model }: { token: string; model: RenterModel }) {
  const here = `/r/${token}`;
  const { operator } = model;
  const tenancy = model.tenancy;
  const copy = tenancyCopy.tasks;
  if (!tenancy) {
    return (
      <PrivateFrame
        audience="renter"
        lister={model.lister}
        home={model.home}
        next={<p>{copy.agreement_coming.next}</p>}
      >
        <Task title={tenancyCopy.title}>
          <p>{copy.agreement_coming.text(operator)}</p>
        </Task>
      </PrivateFrame>
    );
  }
  const button = (href: string, label: string) => (
    <div className={styles.actions}>
      <ButtonLink href={href} variant="primary" fullWidth="phone">
        {label}
      </ButtonLink>
    </div>
  );
  const tasks: Record<typeof tenancy.task, { body: ReactNode; next: string }> = {
    agreement_coming: {
      body: <p>{copy.agreement_coming.text(operator)}</p>,
      next: copy.agreement_coming.next,
    },
    sign: {
      body: (
        <>
          <p>{copy.sign.text}</p>
          {button(`${here}/agreement`, copy.sign.button)}
        </>
      ),
      next: copy.sign.next(operator),
    },
    agreement_countersign: {
      body: <p>{copy.agreement_countersign.text(operator)}</p>,
      next: copy.agreement_countersign.next,
    },
    payment_coming: {
      body: <p>{copy.payment_coming.text(operator)}</p>,
      next: copy.payment_coming.next,
    },
    pay: {
      body: (
        <>
          <p>{copy.pay.text(tenancy.total, tenancy.payBy)}</p>
          {button(`${here}/pay`, copy.pay.button)}
        </>
      ),
      next: copy.pay.next(operator),
    },
    pps: {
      body: (
        <section className={styles.task} aria-labelledby="pps-title">
          <div className={styles.titles}>
            <h3 id="pps-title" className="type-title">
              {tenancyCopy.pps.title}
            </h3>
            <p>{tenancyCopy.pps.why(operator)}</p>
          </div>
          <PpsStep token={token} />
        </section>
      ),
      next: tenancyCopy.pps.next(operator),
    },
    inventory: {
      body: (
        <>
          <p>{copy.inventory.text}</p>
          {button(`${here}/inventory`, copy.inventory.button)}
        </>
      ),
      next: copy.inventory.next(operator),
    },
    moving_in: {
      body: <p>{copy.moving_in.text}</p>,
      next: copy.moving_in.next(operator, tenancy.start),
    },
    moved_in: {
      body: (
        <Outcome tone="success" title={copy.moved_in.title}>
          <p>{copy.moved_in.text(tenancy.movedInOn ?? tenancy.start)}</p>
        </Outcome>
      ),
      next: copy.moved_in.next(operator),
    },
  };
  const task = tasks[tenancy.task];
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={<p>{task.next}</p>}
    >
      <Task title={tenancyCopy.title} lead={tenancyCopy.lead(tenancy.start)}>
        <StepList
          label={tenancyCopy.list}
          steps={tenancy.steps.map((step) => ({
            name: tenancyCopy.steps[step.key],
            state: step.state,
            stateLabel: tenancyCopy.states[step.state],
          }))}
        />
        {task.body}
        {tenancy.agreementSent && tenancy.task !== 'sign' ? (
          <p>
            <Link href={`${here}/agreement`} className={styles.lineLink}>
              {tenancyCopy.readAgreement}
            </Link>
          </p>
        ) : null}
      </Task>
    </PrivateFrame>
  );
}
