import { House } from 'lucide-react';
import type { ReactNode } from 'react';
import { lettingPageCopy } from '@/copy/letting-page';
import { progressOf } from '@/domain/lettings/overview';
import type { Stage } from '@/domain/lettings/stages';
import { ChipLinks } from '@/ui/Chips';
import { BackLink, PageHeader } from '@/ui/Layout';
import { SegmentedProgress } from '@/ui/SegmentedProgress';
import styles from './letting.module.css';

const copy = lettingPageCopy;

export type LettingView = 'overview' | 'people' | 'home';

/**
 * The top of a letting's page (section 4, "Layout"): back to Lettings, the cover photo small,
 * the address as the title, one status line and the menu. Under it, the four parts (UX-LP-3:
 * "Find · Viewings", never "Step n of 9") and the three views, the same at every stage (UX-LP-2).
 */
export function LettingHeader({
  letting,
  stage,
  cover,
  view,
  menu,
}: {
  letting: { id: string; addressLine1: string; area: string; status: string };
  /** The stage the page is written for. */
  stage: Stage;
  cover: string | null;
  view: LettingView;
  menu: ReactNode;
}) {
  const progress = progressOf(stage);
  const status = copy.status[letting.status] ?? copy.status.draft;
  const here = `/lettings/${letting.id}`;
  return (
    <div className={styles.top}>
      <BackLink href="/lettings">Lettings</BackLink>
      <header className={styles.header}>
        <div className={styles.cover}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className={styles.coverPhoto} />
          ) : (
            <House size={24} strokeWidth={1.75} aria-hidden="true" />
          )}
        </div>
        <div className={styles.headerText}>
          <h1 className={`${styles.title} type-display`}>{letting.addressLine1}</h1>
          <p className={styles.status}>
            {letting.area} · {status}
          </p>
        </div>
        <div className={styles.menu}>{menu}</div>
      </header>
      <SegmentedProgress
        label={copy.progress}
        segments={progress.segments}
        current={progress.current}
        detail={progress.detail}
      />
      <ChipLinks
        label={copy.views.label}
        items={(['overview', 'people', 'home'] as const).map((key) => ({
          href: key === 'overview' ? here : `${here}?view=${key}`,
          label: copy.views[key],
          current: view === key,
        }))}
      />
    </div>
  );
}

/**
 * A task for one letting (viewing times, the tenancy's steps, the record): one job per screen,
 * with a way back to the letting.
 */
export function TaskHeader({
  letting,
  title,
  lead,
  back,
}: {
  letting: { id: string; addressLine1: string };
  title: string;
  lead?: string;
  /** Where "back" goes, if not the letting's Overview. */
  back?: string;
}) {
  return (
    <PageHeader
      back={{ href: back ?? `/lettings/${letting.id}`, label: letting.addressLine1 }}
      title={title}
      lead={lead}
    />
  );
}
