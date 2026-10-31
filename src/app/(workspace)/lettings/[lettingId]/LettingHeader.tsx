import Link from 'next/link';
import { stageLabels, stageNumber, type Stage } from '@/domain/lettings/stages';
import { formatDate, formatRent } from '@/lib/format';
import { PageHeader, Stack } from '@/ui/Layout';
import { StageTracker } from '@/ui/StageTracker';
import styles from './letting.module.css';

/** The letting's address as the page title, with where it is in the nine stages. */
export function LettingHeader({
  letting,
  section,
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
    </Stack>
  );
}
