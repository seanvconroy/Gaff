import Link from 'next/link';
import { readingInWords, renterDocumentsCopy } from '@/copy/documents';
import { checksCopy } from '@/copy/renter';
import type { DocumentFlag } from '@/domain/documents/flags';
import type { DocumentsPage, RenterDocument } from '@/server/documents/renter';
import { ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { removeDocumentAction } from './document-actions';
import { DocumentUpload } from './DocumentUpload';
import { ShareForm } from './ShareForm';

const copy = renterDocumentsCopy;

/** P38: what to fix in one document, in words. Never "danger", never a refusal. */
function flagWords(
  flag: DocumentFlag,
  document: RenterDocument,
  view: DocumentsPage,
  operator: string,
  verified: boolean,
): string {
  switch (flag) {
    case 'kind_differs':
      return copy.flags.kind_differs(copy.kind(document.kind));
    case 'name_differs':
      return copy.flags.name_differs(view.matchName, verified);
    case 'out_of_date':
      return copy.flags.out_of_date(document.kind);
    case 'not_read':
      return document.kind === 'other_income'
        ? copy.flags.not_read_other
        : copy.flags.not_read_work(operator);
  }
}

function DocumentItem({
  token,
  document,
  view,
  operator,
  verified,
}: {
  token: string;
  document: RenterDocument;
  view: DocumentsPage;
  operator: string;
  verified: boolean;
}) {
  const unread = document.readBy === 'nobody';
  const change = `/r/${token}/documents/${document.id}`;
  return (
    <li className={styles.item}>
      <Stack gap={2}>
        <div className={styles.itemHead}>
          <h4 className="type-heading">{copy.kind(document.kind)}</h4>
          {document.correctedByRenter ? (
            <StatusPill large>{copy.changedByYou}</StatusPill>
          ) : document.readBy === 'gaff' ? (
            <StatusPill tone="ai" large>
              {copy.readByGaff}
            </StatusPill>
          ) : document.readBy === 'renter' ? (
            <StatusPill large>{copy.enteredByYou}</StatusPill>
          ) : null}
          {document.fromProfile ? <StatusPill large>{copy.fromProfile}</StatusPill> : null}
        </div>
        {unread ? null : <p>{readingInWords(document.kind, document.reading)}</p>}
        {document.flags.map((flag) => (
          // P38: in `warning`, with the words, never `danger`; not a boxed notice (UX-PP-6).
          <p key={flag} data-flag={flag}>
            <StatusPill tone="warning" large>
              {copy.toCheck}
            </StatusPill>{' '}
            {flagWords(flag, document, view, operator, verified)}
          </p>
        ))}
        <div className={styles.quietRow}>
          <Link href={change} className={styles.lineLink}>
            {unread ? copy.enter : copy.check}
          </Link>
          <form action={removeDocumentAction.bind(null, token, document.id)}>
            <SubmitButton variant="quiet" pendingLabel={copy.removing}>
              {copy.remove}
            </SubmitButton>
          </form>
        </div>
      </Stack>
    </li>
  );
}

/**
 * BA-16 (P30 to P38): the work and income step of a chosen renter's checks. What is asked, for
 * how they said they earn; who sees it and when it's deleted, in one line with "More"; what's
 * added so far, each with what Gaff read and anything to fix; and a way to add one more. The
 * one primary button is "Add this document" until something is added, then "Check and share".
 */
export function DocumentsTask({
  token,
  operator,
  view,
  verified,
}: {
  token: string;
  operator: string;
  view: DocumentsPage;
  /** Whether the renter's ID check has passed, so documents are matched to the name on it. */
  verified: boolean;
}) {
  const any = view.documents.length > 0;
  return (
    <section className={styles.task} aria-labelledby="next-check">
      <div className={styles.titles}>
        <h3 id="next-check" className="type-title">
          {checksCopy.names.income}
        </h3>
        <p>{copy.ask[view.ask]}</p>
        {view.ask !== 'other_income' ? <p>{copy.otherIncome}</p> : null}
      </div>
      <div className={styles.keeps} data-notice="check">
        <p>{copy.keeps(operator)}</p>
        <Disclosure summary={checksCopy.more}>
          <p>{copy.more(operator)}</p>
        </Disclosure>
      </div>
      {view.readerOn ? null : <p>{copy.readerOff(operator)}</p>}
      {any ? (
        <section aria-labelledby="documents-added">
          <Stack gap={3}>
            <h4 id="documents-added" className="type-heading">
              {copy.added}
            </h4>
            <ul className={styles.items}>
              {view.documents.map((document) => (
                <DocumentItem
                  key={document.id}
                  token={token}
                  document={document}
                  view={view}
                  operator={operator}
                  verified={verified}
                />
              ))}
            </ul>
          </Stack>
        </section>
      ) : null}
      {view.canAdd ? (
        <DocumentUpload token={token} kinds={view.kinds} primary={!any} />
      ) : (
        <p>{copy.full}</p>
      )}
      {any ? (
        <div className={styles.actions}>
          {view.answered ? null : <p>{copy.stillAsked}</p>}
          <ButtonLink href={`/r/${token}?q=share`} variant="primary" fullWidth="phone">
            {copy.toShare}
          </ButtonLink>
        </div>
      ) : null}
    </section>
  );
}

/**
 * P39: the one step that shares everything, showing exactly what will be shared: their ID check
 * (which the letter has already), each document as the letter will see it, and the referees Gaff
 * will email now. "Keep these documents for my next application" is unticked (P40, Q25).
 */
export function ShareStep({
  token,
  operator,
  view,
  identity,
}: {
  token: string;
  operator: string;
  view: DocumentsPage;
  identity: { name: string; on: string } | null;
}) {
  return (
    <section className={styles.task} aria-labelledby="share-title">
      <div className={styles.titles}>
        <h3 id="share-title" className="type-title">
          {copy.share.title(operator)}
        </h3>
        <p>{copy.share.lead(operator)}</p>
      </div>
      <section aria-labelledby="share-identity">
        <Stack gap={2}>
          <h4 id="share-identity" className="type-heading">
            {copy.share.identity}
          </h4>
          <p>
            {identity
              ? copy.share.identityDone(identity.name, identity.on)
              : copy.share.identityNot}
          </p>
        </Stack>
      </section>
      <section aria-labelledby="share-documents">
        <Stack gap={3}>
          <h4 id="share-documents" className="type-heading">
            {copy.share.documents}
          </h4>
          <ul className={styles.items}>
            {view.documents.map((document) => (
              <li key={document.id} className={styles.item}>
                <Stack gap={2}>
                  <p className={styles.itemName}>{copy.kind(document.kind)}</p>
                  {document.readBy === 'nobody' ? (
                    <p>{copy.flags.not_read_work(operator)}</p>
                  ) : (
                    <p>{readingInWords(document.kind, document.reading)}</p>
                  )}
                  <p className={styles.muted}>
                    {document.kind === 'other_income'
                      ? copy.share.regular(operator)
                      : copy.share.canOpen(operator)}
                  </p>
                </Stack>
              </li>
            ))}
          </ul>
        </Stack>
      </section>
      <section aria-labelledby="share-referees">
        <Stack gap={2}>
          <h4 id="share-referees" className="type-heading">
            {copy.share.referees}
          </h4>
          {view.referees.length === 0 ? <p>{copy.share.noReferees}</p> : null}
          {view.referees.map((referee) => (
            <p key={referee.kind}>
              {copy.share.refereeLine(referee.kind, referee.name, referee.email)}
            </p>
          ))}
        </Stack>
      </section>
      <ShareForm token={token} operator={operator} canKeep={view.canKeep} />
      <p>{copy.share.next(operator)}</p>
      <p>
        <Link href={`/r/${token}`} className={styles.lineLink}>
          {copy.share.back}
        </Link>
      </p>
    </section>
  );
}
