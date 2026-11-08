import Link from 'next/link';
import { stageLabels, stageNumber, type Stage, stages } from '@/domain/lettings/stages';
import { formatDate, formatRent } from '@/lib/format';
import { PageHeader, Stack } from '@/ui/Layout';
import { StageTracker } from '@/ui/StageTracker';
import { StatusPill } from '@/ui/StatusPill';
import styles from './letting.module.css';

/**
 * The letting's pages. Each appears once the letting reaches the stage it's for, so a home being
 * set up shows only what can be done now (progressive disclosure); the stage tracker shows what's
 * still to come.
 */
const tabs = [
  { key: 'overview', label: 'Overview', path: '', from: 'setup' },
  // M37 to M52: the marketplace listing is written while the letting is set up.
  { key: 'listing', label: 'Listing', path: '/listing', from: 'setup' },
  { key: 'enquiries', label: 'Enquiries', path: '/enquiries', from: 'enquiries' },
  { key: 'shortlist', label: 'Shortlist', path: '/shortlist', from: 'enquiries' },
  { key: 'attendance', label: 'Attendance', path: '/attendance', from: 'viewings' },
  { key: 'applications', label: 'Applications', path: '/applications', from: 'applications' },
  { key: 'tenancy', label: 'Tenancy', path: '/tenancy', from: 'tenancy' },
  { key: 'timeline', label: 'Timeline', path: '/timeline', from: 'setup' },
] as const satisfies ReadonlyArray<{ key: string; label: string; path: string; from: Stage }>;

export type LettingTab = (typeof tabs)[number]['key'];

const status = {
  draft: ['neutral', 'Not live yet'],
  live: ['success', 'Live'],
  let: ['success', 'Let'],
  withdrawn: ['neutral', 'Withdrawn'],
} as const;

interface HeaderLetting {
  id: string;
  addressLine1: string;
  area: string;
  monthlyRentCents: number;
  availableFrom: string;
  stage: Stage;
  status?: string;
}

/** The letting's address as the page title, where it is in the nine stages, and its pages. */
export function LettingHeader({ letting, tab }: { letting: HeaderLetting; tab: LettingTab }) {
  const reached = stages.indexOf(letting.stage);
  const visible = tabs.filter((t) => stages.indexOf(t.from) <= reached || t.key === tab);
  const [tone, words] = status[(letting.status ?? 'draft') as keyof typeof status] ?? status.draft;
  return (
    <Stack gap={6}>
      <PageHeader
        back={{ href: '/', label: 'Lettings' }}
        eyebrow={
          <span className={styles.eyebrow}>
            <span>
              Step {stageNumber(letting.stage)} of 9 · {stageLabels[letting.stage]}
            </span>
            <StatusPill tone={tone}>{words}</StatusPill>
          </span>
        }
        title={letting.addressLine1}
        lead={`${letting.area} · ${formatRent(letting.monthlyRentCents)} · Available from ${formatDate(letting.availableFrom)}`}
      />
      <StageTracker current={letting.stage} />
      <nav aria-label="Letting" className={styles.tabs}>
        <ul className={styles.tabList}>
          {visible.map((t) => (
            <li key={t.key}>
              <Link
                href={`/lettings/${letting.id}${t.path}`}
                className={t.key === tab ? styles.tabCurrent : styles.tab}
                aria-current={t.key === tab ? 'page' : undefined}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Stack>
  );
}

/**
 * A set-up task for one letting (viewing times, criteria, the rent check, comparables): one job
 * per screen, with a way back to the letting and no tabs to distract from it.
 */
export function TaskHeader({
  letting,
  title,
  lead,
}: {
  letting: Pick<HeaderLetting, 'id' | 'addressLine1'>;
  title: string;
  lead?: string;
}) {
  return (
    <PageHeader
      back={{ href: `/lettings/${letting.id}`, label: letting.addressLine1 }}
      title={title}
      lead={lead}
    />
  );
}
