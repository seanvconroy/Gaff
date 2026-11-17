import type { Metadata } from 'next';
import { ownerCopy } from '@/copy/owner';
import { homeFrom } from '@/domain/frame/frame';
import { DECISIONS_SHOWN } from '@/domain/landlord/owner-page';
import { lettingParts, partReached } from '@/domain/lettings/parts';
import { landlordView, type OwnerStep } from '@/server/landlord/view';
import { Disclosure } from '@/ui/Disclosure';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';
import { SegmentedProgress } from '@/ui/SegmentedProgress';
import { SummaryList } from '@/ui/SummaryList';
import styles from '../landlord.module.css';

export const metadata: Metadata = { title: 'Your letting' };
export const dynamic = 'force-dynamic';

/**
 * R27 (Q4), UX-OP-1 to UX-OP-5: the owner's page, by private link, with no account. One screen
 * that answers "how is it going?": where the letting stands, up to three figures, what's been
 * decided, what's asked of renters, and what happens next. The whole record, without Gaff's
 * internal steps, is behind "See everything that's happened". Once the home is let, the page is
 * a summary.
 *
 * Renters are "Applicant 1" here, always (UX-OP-2): the chosen tenant and the backup are named
 * only on the approval the agent sends (`/approve/[token]`). The frame is the agency's
 * (UX-PP-9), and its footer says how to reach them (UX-OP-4).
 */
export default async function LandlordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = new Date();
  const view = await landlordView(token, now);
  if (!view) {
    return (
      <PrivateFrame audience="owner" lister={null}>
        <Outcome tone="info" title={ownerCopy.ended.title} headingLevel={1}>
          <p>{ownerCopy.ended.text}</p>
        </Outcome>
      </PrivateFrame>
    );
  }
  const { letting, standing, summary, organisationName: operator } = view;
  const decisions = view.decisions.slice(0, DECISIONS_SHOWN);
  return (
    <PrivateFrame
      audience="owner"
      lister={view.lister}
      home={homeFrom(letting)}
      next={
        <p>
          {ownerCopy.next(
            standing,
            {
              operator,
              nextViewingAt: view.nextViewingAt,
              offerClosesAt: view.offerClosesAt,
              summary,
            },
            now,
          )}
        </p>
      }
    >
      <div className={styles.task}>
        <div className={styles.standing}>
          <p className={styles.standingLine} data-owner="standing">
            {ownerCopy.standing(standing, operator)}
          </p>
          {letting.status === 'withdrawn' ? null : (
            <SegmentedProgress
              label={ownerCopy.progress}
              segments={lettingParts}
              current={partReached(letting.stage)}
              large
            />
          )}
        </div>

        {summary ? (
          <div data-owner="summary">
            <SummaryList layout="split" rows={ownerCopy.summary.rows(summary, now)} />
          </div>
        ) : (
          <>
            {view.figures.length > 0 ? (
              <div data-owner="figures">
                <SummaryList
                  layout="split"
                  rows={view.figures.map((figure) => ({
                    label: ownerCopy.figures.name(figure.code),
                    value: ownerCopy.figures.value(figure),
                  }))}
                />
              </div>
            ) : null}

            <section className={styles.group} aria-labelledby="decided-heading">
              <h2 id="decided-heading" className="type-title">
                {ownerCopy.decided.title}
              </h2>
              {decisions.length === 0 ? (
                <p className={styles.muted}>{ownerCopy.decided.none}</p>
              ) : (
                <ol className={styles.lines}>
                  {decisions.map((step) => {
                    const decision = ownerCopy.decision(step, now);
                    return (
                      <li key={step.id} className={styles.line}>
                        <span className={styles.strong}>{decision.what}</span>
                        <span className={styles.muted}>{decision.by}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className={styles.group} aria-labelledby="details-heading">
              <h2 id="details-heading" className="type-title">
                {ownerCopy.details.title}
              </h2>
              <p>{ownerCopy.details.line(view.criteria)}</p>
            </section>
          </>
        )}

        <Disclosure summary={ownerCopy.everything.summary}>
          <Record steps={view.record} now={now} />
        </Disclosure>
      </div>
    </PrivateFrame>
  );
}

/** UX-OP-3: the record as an owner sees it: newest first, with renters as "Applicant N". */
function Record({ steps, now }: { steps: readonly OwnerStep[]; now: Date }) {
  const lines = steps.flatMap((step) => {
    const line = ownerCopy.recordLine(step, now);
    return line ? [{ step, line }] : [];
  });
  if (lines.length === 0) return <p className={styles.muted}>{ownerCopy.everything.none}</p>;
  return (
    <ol className={styles.lines} data-owner="record">
      {lines.map(({ step, line }) => (
        <li key={step.id} className={styles.line}>
          <span>
            <span className={styles.strong}>{line.what}</span>
            <span className={styles.muted}> · {ownerCopy.who(step.actor)}</span>
          </span>
          {line.detail ? <span>{line.detail}</span> : null}
          <span className={styles.muted}>{ownerCopy.when(step.at, now)}</span>
        </li>
      ))}
    </ol>
  );
}
