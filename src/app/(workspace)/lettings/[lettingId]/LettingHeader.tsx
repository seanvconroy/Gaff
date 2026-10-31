import Link from 'next/link';
import { stageLabels, stageNumber, type Stage } from '@/domain/lettings/stages';
import { formatDate, formatRent } from '@/lib/format';
import { PageHeader, Stack } from '@/ui/Layout';
import { StageTracker } from '@/ui/StageTracker';
import styles from './letting.module.css';

const tabs = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'enquiries', label: 'Enquiries', path: '/enquiries' },
  { key: 'timeline', label: 'Timeline', path: '/timeline' },
] as const;

/** The letting's address as the page title, where it is in the nine stages, and its pages. */
export function LettingHeader({
  letting,
  section,
  tab,
}: {
  letting: {
    id: string;
    addressLine1: string;
    area: string;
    monthlyRentCents: number;
    availableFrom: string;
    stage: Stage;
  };
  section?: string;
  tab?: (typeof tabs)[number]['key'];
}) {
  return (
    <Stack gap={4}>
      {section ? (
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href={`/lettings/${letting.id}`}>{letting.addressLine1}</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{section}</span>
        </nav>
      ) : null}
      <PageHeader
        eyebrow={`Step ${stageNumber(letting.stage)} of 9 · ${stageLabels[letting.stage]}`}
        title={section ?? letting.addressLine1}
        lead={`${letting.addressLine1}, ${letting.area} · ${formatRent(letting.monthlyRentCents)} · Available from ${formatDate(letting.availableFrom)}`}
      />
      <StageTracker current={letting.stage} />
      {tab ? (
        <nav aria-label="Letting" className={styles.tabs}>
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/lettings/${letting.id}${t.path}`}
              className={t.key === tab ? styles.tabCurrent : styles.tab}
              aria-current={t.key === tab ? 'page' : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </Stack>
  );
}
