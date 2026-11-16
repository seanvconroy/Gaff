import { Phone } from 'lucide-react';
import { codeGateCopy, notices, offerCopy, tenancyCopy } from '@/copy/renter';
import { reachAPerson } from '@/domain/frame/frame';
import type { RenterModel } from '@/server/renter/model';
import { buttonProps } from '@/ui/Button';
import { CopyButton } from '@/ui/CopyButton';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { SummaryList } from '@/ui/SummaryList';
import styles from '../renter.module.css';
import { CodeGate } from './CodeGate';
import { Task } from './Task';

const copy = tenancyCopy.pay;

export interface PayDetails {
  total: string;
  deposit: string;
  firstRent: string;
  /** "Friday 4 December" */
  payBy: string | null;
  accountName: string;
  /** In groups of four, as it's read out. */
  iban: string;
  reference: string | null;
  /** When the operator confirmed the money arrived: "Tuesday 1 December". */
  receivedOn: string | null;
}

/**
 * R23, UX-RN-22, UX-RN-23: what to pay, by when, and where: the lister's own account, never Gaff
 * (rule 5). The total, the account, and copy buttons for the IBAN and the reference.
 *
 * The page's one primary action is the one that stops a real mistake: ringing the lister to
 * check the details before paying, because payment-diversion scams copy emails (UX-PP-6, notice
 * 3). The number shown is the lister's own.
 *
 * THE NUMBER'S SEAM (Q43): a lister has a phone number once the operator's side asks for one
 * (work packages WP-9 and WP-18: asked at go-live, and required before payment is requested).
 * Until then there is none on file, and the page asks the tenant to ring a number they already
 * have for the lister. `/dev/ui/renter` shows both.
 */
export function PayTask({ model, details }: { model: RenterModel; details: PayDetails }) {
  const { operator } = model;
  const phone = reachAPerson(model.lister).phone;
  if (details.receivedOn) {
    return (
      <Outcome tone="success" title={copy.received} role="status">
        <p>{copy.receivedText(operator, details.total, details.receivedOn)}</p>
      </Outcome>
    );
  }
  return (
    <Task title={copy.title}>
      <section className={styles.group} aria-labelledby="pay-total">
        <div className={styles.fact}>
          <h3 id="pay-total" className="type-heading">
            {copy.total}
          </h3>
          <p className={styles.total}>{details.total}</p>
          {details.payBy ? <p>{copy.by(details.payBy)}</p> : null}
        </div>
        <SummaryList
          layout="split"
          rows={[
            { label: offerCopy.deposit, value: details.deposit },
            { label: offerCopy.firstRent, value: details.firstRent },
          ]}
        />
      </section>
      <section className={styles.group} aria-labelledby="pay-into">
        <h3 id="pay-into" className="type-heading">
          {copy.into}
        </h3>
        <SummaryList
          rows={[
            { label: copy.accountName, value: details.accountName },
            {
              label: copy.iban,
              value: <span className={styles.mono}>{details.iban}</span>,
              action: <CopyButton value={details.iban.replace(/\s+/g, '')} what={copy.copyIban} />,
            },
            ...(details.reference
              ? [
                  {
                    label: copy.reference,
                    value: <span className={styles.mono}>{details.reference}</span>,
                    action: <CopyButton value={details.reference} what={copy.copyReference} />,
                  },
                ]
              : []),
          ]}
        />
      </section>
      <div className={styles.group} data-notice="ring">
        <Notice tone="warning" title={notices.ringToCheck.title}>
          <p>
            {phone
              ? notices.ringToCheck.withNumber(operator, phone.shown)
              : notices.ringToCheck.withoutNumber(operator)}
          </p>
        </Notice>
        {phone ? (
          <div className={styles.actions}>
            <a href={phone.href} {...buttonProps('primary', 'phone')}>
              <Phone size={20} strokeWidth={1.75} aria-hidden="true" />
              {notices.ringToCheck.button(phone.shown)}
            </a>
          </div>
        ) : null}
      </div>
    </Task>
  );
}

/** The payment page, in the frame, open or still asking for the one-time code (UX-SI-12). */
export function PayPage({
  token,
  model,
  details,
  sentTo,
}: {
  token: string;
  model: RenterModel;
  /** Null until this browser has entered the code: the bank details aren't loaded before. */
  details: PayDetails | null;
  sentTo: string;
}) {
  const { operator } = model;
  return (
    <PrivateFrame
      audience="renter"
      lister={model.lister}
      home={model.home}
      next={
        <p>
          {details
            ? details.receivedOn
              ? copy.receivedNext(operator)
              : copy.next(operator)
            : codeGateCopy.thenPay}
        </p>
      }
    >
      {details ? (
        <PayTask model={model} details={details} />
      ) : (
        <Task title={codeGateCopy.title}>
          <CodeGate token={token} sentTo={sentTo} />
        </Task>
      )}
    </PrivateFrame>
  );
}
