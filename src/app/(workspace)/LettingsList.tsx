import { House } from 'lucide-react';
import { stageLabels, stageNumber } from '@/domain/lettings/stages';
import { formatDate, formatMinutes, formatRent } from '@/lib/format';
import type { dashboardFor } from '@/server/dashboard/dashboard';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { StageMeter } from '@/ui/StageTracker';
import { StatusPill } from '@/ui/StatusPill';
import styles from './dashboard.module.css';

type Dashboard = Awaited<ReturnType<typeof dashboardFor>>;

const daysAgo = (n: number) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

const statusPill = {
  draft: ['neutral', 'Not live yet'],
  live: ['success', 'Live'],
  let: ['success', 'Let'],
  withdrawn: ['neutral', 'Withdrawn'],
} as const;

/**
 * R28: every letting as a whole-row link, with its stage and the time it has taken against the
 * usual. Shown on Today and on Lettings until work package WP-7 rebuilds both.
 */
export function LettingsList({
  lettings,
  usualDaysToLet,
}: Pick<Dashboard, 'lettings' | 'usualDaysToLet'>) {
  return (
    <ActionList flush>
      {lettings.map((letting) => {
        const [tone, status] = statusPill[letting.status as keyof typeof statusPill] ?? [
          'neutral',
          'Not live yet',
        ];
        return (
          <ActionRow
            key={letting.id}
            id={`letting-${letting.id}`}
            href={`/lettings/${letting.id}`}
            icon={House}
            nameFromTitle
            title={letting.addressLine1}
            meta={
              <>
                <span className={styles.line}>
                  {letting.area} · {formatRent(letting.monthlyRentCents)} · Available from{' '}
                  {formatDate(letting.availableFrom)}
                </span>
                <span className={styles.line}>
                  Your time in Gaff: {formatMinutes(letting.time.minutes)}
                  {letting.time.usual !== null
                    ? ` · usually ${formatMinutes(letting.time.usual)} a letting`
                    : ''}
                  {letting.daysToLet !== null
                    ? ` · let in ${letting.daysToLet} ${letting.daysToLet === 1 ? 'day' : 'days'}${usualDaysToLet !== null ? `, usually ${usualDaysToLet}` : ''}`
                    : letting.daysSinceFirstEnquiry !== null
                      ? ` · first enquiry ${daysAgo(letting.daysSinceFirstEnquiry)}${usualDaysToLet !== null ? `, usually let in ${usualDaysToLet} days` : ''}`
                      : ''}
                </span>
              </>
            }
            trailing={
              <span className={styles.stage}>
                <span className={styles.stageTop}>
                  <StatusPill tone={tone}>{status}</StatusPill>
                </span>
                <span className={styles.stageWords}>
                  <StageMeter current={letting.stage} />
                  <span>
                    Step {stageNumber(letting.stage)} of 9 · {stageLabels[letting.stage]}
                  </span>
                </span>
              </span>
            }
          />
        );
      })}
    </ActionList>
  );
}
