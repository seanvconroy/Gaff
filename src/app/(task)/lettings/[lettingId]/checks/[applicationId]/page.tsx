import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Fragment } from 'react';
import { P47_REMINDER, WHAT_GAFF_CHECKED, letterDocumentsCopy } from '@/copy/documents';
import { firstNameOf } from '@/domain/accounts/first-run';
import { conversationHref, conversationKey } from '@/domain/inbox/conversations';
import { decisionHref } from '@/domain/lettings/links';
import { formatDate } from '@/lib/format';
import { chosenRenterPack, type SharedDocument } from '@/server/documents/letter';
import { ButtonLink } from '@/ui/Button';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SummaryList } from '@/ui/SummaryList';
import { loadDecision } from '../../_decisions/load';

export const metadata: Metadata = { title: letterDocumentsCopy.metaTitle };

const copy = letterDocumentsCopy;

/**
 * BA-16 (P44 to P48): one chosen renter's checks, for the letting's team, in words: their ID and
 * when it was checked; their work, from the employer's reference; what each document shows,
 * beside the household income they gave; and anything to look at, in `warning`, with a plain
 * reason and what to do. No score, no ratio and no "pass": a person decides (rule 1). Payslips
 * and employer documents open while they're kept, each opening recorded; regular income never
 * has a document to open (P33, rule 3). Wherever income is shown, the fixed reminder (P47).
 */
export default async function ChosenRenterChecksPage({
  params,
}: {
  params: Promise<{ lettingId: string; applicationId: string }>;
}) {
  const { applicationId } = await params;
  const { member, letting } = await loadDecision(params);
  const pack = await chosenRenterPack(member, letting.id, applicationId);
  if (!pack) notFound();
  const first = firstNameOf(pack.name) || pack.name;
  const checksHref = decisionHref(letting.id, 'checks');
  const ask = conversationHref(conversationKey({ kind: 'renter', id: pack.applicationId }));

  const flagLines = (document: SharedDocument) =>
    document.flags.map((flag) => {
      switch (flag) {
        case 'name_differs':
          return copy.flags.name_differs(
            document.reading?.name ?? null,
            pack.identity.verifiedName,
            first,
          );
        case 'out_of_date':
          return copy.flags.out_of_date(document.kind, first);
        case 'kind_differs':
          return copy.flags.kind_differs(first);
        case 'not_read':
          return copy.flags.not_read(first);
      }
    });

  return (
    <FlowShell
      leave={{ kind: 'close', href: checksHref }}
      primary={
        <ButtonLink href={checksHref} variant="primary" fullWidth="phone">
          {copy.back}
        </ButtonLink>
      }
    >
      <FlowTitle title={copy.title(pack.name)} lead={copy.lead} />
      {/* P47: wherever a letter sees income. */}
      <Notice tone="info">
        <p>{P47_REMINDER}</p>
      </Notice>
      <SummaryList
        rows={[
          {
            label: copy.identity,
            value:
              pack.identity.verifiedName && pack.identity.checkedAt
                ? copy.identityDone(pack.identity.verifiedName, formatDate(pack.identity.checkedAt))
                : copy.identityNot,
          },
          ...(pack.employer
            ? [
                {
                  label: copy.work,
                  value: (
                    <Stack gap={2}>
                      <span>
                        {pack.employer.summary
                          ? copy.workFromReference(pack.employer.summary)
                          : pack.employer.status === 'not_needed'
                            ? copy.workNone
                            : copy.workWaiting(pack.employer.refereeName ?? first)}
                      </span>
                      {pack.employer.personalAddress ? (
                        <Notice tone="warning">
                          <p>{copy.personalAddress}</p>
                        </Notice>
                      ) : null}
                    </Stack>
                  ),
                },
              ]
            : []),
          ...(pack.landlord?.summary
            ? [{ label: copy.landlord, value: pack.landlord.summary }]
            : []),
          ...(pack.householdIncomeCents !== null
            ? [{ label: copy.household, value: copy.householdValue(pack.householdIncomeCents) }]
            : []),
        ]}
      />
      <section aria-labelledby="documents-heading">
        <Stack gap={4}>
          <h2 id="documents-heading" className="type-title">
            {copy.documents}
          </h2>
          {pack.documents.length === 0 ? <p>{copy.notShared(first)}</p> : null}
          {pack.documents.map((document) => {
            const reading = document.reading;
            const about = reading ? copy.aboutAMonth(reading) : null;
            return (
              <Fragment key={document.id}>
                <Stack gap={2}>
                  <h3 className="type-heading">{copy.kind(document.kind)}</h3>
                  <p>
                    {document.readBy === 'nobody' || !reading
                      ? document.kind === 'regular_income'
                        ? copy.regularNotGiven(first)
                        : copy.notRead
                      : copy.shows(document.kind, reading)}
                    {about ? ` ${about}` : ''}
                  </p>
                  <span>
                    {document.correctedByRenter ? (
                      <StatusPill>{copy.changedBy(first)}</StatusPill>
                    ) : document.readBy === 'gaff' ? (
                      <StatusPill tone="ai">{copy.readByGaff}</StatusPill>
                    ) : document.readBy === 'renter' ? (
                      <StatusPill>{copy.enteredBy(first)}</StatusPill>
                    ) : null}
                  </span>
                  {flagLines(document).map((line) => (
                    // P46: warning, never danger, with what to do; a person decides.
                    <Notice key={line} tone="warning">
                      <p>{line}</p>
                      <p>
                        <ButtonLink href={ask} variant="quiet">
                          {copy.askAbout(first)}
                        </ButtonLink>
                      </p>
                    </Notice>
                  ))}
                  {document.kind === 'regular_income' ? (
                    <p>{copy.regularNote}</p>
                  ) : document.canOpen ? (
                    <p>
                      <ButtonLink
                        href={`/lettings/${letting.id}/documents/${document.id}`}
                        variant="secondary"
                      >
                        {copy.open}
                      </ButtonLink>{' '}
                      {copy.keptUntil(formatDate(document.deleteAfter))}
                    </p>
                  ) : document.deleted ? (
                    <p>{copy.deleted}</p>
                  ) : null}
                </Stack>
              </Fragment>
            );
          })}
          {pack.documents.length > 0 ? <p>{WHAT_GAFF_CHECKED}</p> : null}
        </Stack>
      </section>
    </FlowShell>
  );
}
