import Link from 'next/link';
import { decisionsCopy } from '@/copy/decisions';
import { lettingPageCopy } from '@/copy/letting-page';
import type { Figure, NeedsYou } from '@/domain/lettings/overview';
import { formatDateTime } from '@/lib/format';
import type { TimelineEntry } from '@/server/timeline/timeline';
import { ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { SummaryList } from '@/ui/SummaryList';
import { SubmitButton } from '@/ui/SubmitButton';
import { remindOwnerAction } from '@/app/(task)/lettings/[lettingId]/approval/actions';
import { TodayList } from '../../TodayList';
import styles from './letting.module.css';

const copy = lettingPageCopy;

/**
 * Overview (UX-LP-1): three blocks and no more, in order. Needs you holds the page's one primary
 * button, or says nothing does and what Gaff is doing. What's happening has the stage's figures
 * and the last three things, with "See everything" for History (UX-LP-6). What's next is one
 * sentence.
 */
export interface PoolView {
  /** UX-MT-7: one sentence from counts of answers. It names criteria, never people. */
  summary: string;
  /** UX-MT-9: what each criterion is costing, before invitations go out. */
  costs: ReadonlyArray<{ label: string; value: string }>;
  costsLabel: string;
  change: { href: string; label: string; next: string } | null;
}

export function OverviewView({
  pool,
  lettingId,
  needs,
  figures,
  recent,
  next,
  remindOwner,
  waitingOn,
  tenancyHref,
  resultsHref,
}: {
  pool: PoolView | null;
  lettingId: string;
  needs: NeedsYou;
  figures: readonly Figure[];
  recent: readonly TimelineEntry[];
  next: string;
  /** UX-DC-16: the owner's first name, while Gaff waits on their answer. */
  remindOwner: string | null;
  /**
   * UX-DC-10, UX-DC-16: what Gaff waits on someone else for. With nothing to do it is Needs
   * you's words; beside a task, it is said quietly under it.
   */
  waitingOn: string | null;
  /** Stage 8: the tenancy's steps, in full. */
  tenancyHref: string | null;
  /** A finished letting: how it went. */
  resultsHref: string | null;
}) {
  const now = new Date();
  const remind = remindOwner ? (
    <form action={remindOwnerAction.bind(null, lettingId)}>
      <input type="hidden" name="from" value="letting" />
      <SubmitButton variant="secondary" pendingLabel={decisionsCopy.owner.waiting.reminding}>
        {decisionsCopy.owner.waiting.remind(remindOwner)}
      </SubmitButton>
    </form>
  ) : null;
  return (
    <div className={styles.blocks}>
      <section className={styles.block} aria-labelledby="needs-heading">
        <h2 id="needs-heading" className="type-title">
          {needs.kind === 'task' ? copy.needsYou.heading : copy.needsYou.nothing}
        </h2>
        {needs.kind === 'task' ? (
          <>
            <p className={styles.lead}>{needs.lead}</p>
            <div>
              <ButtonLink href={needs.href} variant="primary" fullWidth="phone">
                {needs.action}
              </ButtonLink>
            </div>
            {waitingOn
              ? waitingOn.split('\n').map((line) => (
                  <p key={line} className={styles.muted}>
                    {line}
                  </p>
                ))
              : null}
            {remind}
            {needs.also.length > 0 ? (
              <>
                <h3 className="type-heading">{copy.needsYou.also}</h3>
                <TodayList rows={[...needs.also]} flush />
              </>
            ) : null}
          </>
        ) : (
          <>
            {needs.doing.split('\n').map((line) => (
              <p key={line} className={styles.lead}>
                {line}
              </p>
            ))}
            {remind}
          </>
        )}
      </section>

      <section className={styles.block} aria-labelledby="happening-heading">
        <h2 id="happening-heading" className="type-title">
          {copy.happening.heading}
        </h2>
        {figures.length === 0 && recent.length === 0 ? (
          <p className={styles.muted}>{copy.happening.nothing}</p>
        ) : null}
        {figures.length > 0 ? (
          <dl className={styles.figures}>
            {figures.map((figure) => (
              <div key={figure.label} className={styles.figure}>
                <dt className={styles.figureLabel}>{figure.label}</dt>
                <dd className={styles.figureValue}>{figure.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {pool ? (
          <>
            <p data-pool-summary>{pool.summary}</p>
            {pool.costs.length > 0 ? (
              <Disclosure summary={pool.costsLabel}>
                <SummaryList rows={pool.costs} />
                {pool.change ? (
                  <>
                    <p className={styles.small}>{pool.change.next}</p>
                    <p>
                      <Link href={pool.change.href} className={styles.change}>
                        {pool.change.label}
                      </Link>
                    </p>
                  </>
                ) : null}
              </Disclosure>
            ) : null}
          </>
        ) : null}
        {recent.length > 0 ? (
          <>
            <h3 className="type-heading">{copy.happening.recent}</h3>
            <ol className={styles.entries}>
              {recent.map((entry) => (
                <li key={entry.id} className={styles.entry}>
                  <span className={styles.entryWhen}>{formatDateTime(entry.at, now)}</span>
                  <span>{entry.what}</span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
        <p className={styles.links}>
          {tenancyHref ? (
            <Link href={tenancyHref} className={styles.change}>
              {copy.happening.tenancyLink}
            </Link>
          ) : null}
          {resultsHref ? (
            <Link href={resultsHref} className={styles.change}>
              See how it went
            </Link>
          ) : null}
          <Link href={`/lettings/${lettingId}/history`} className={styles.change}>
            {copy.happening.seeEverything}
          </Link>
        </p>
      </section>

      <section className={styles.block} aria-labelledby="next-heading">
        <h2 id="next-heading" className="type-title">
          {copy.next.heading}
        </h2>
        <p className={styles.lead}>{next}</p>
      </section>
    </div>
  );
}
