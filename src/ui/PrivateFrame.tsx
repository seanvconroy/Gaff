import { House } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { frameCopy, fromAssistant } from '@/copy/frame';
import {
  frameFooter,
  frameHeader,
  homeSummaryLine,
  reachAPerson,
  type FrameAudience,
  type FrameHome,
  type Lister,
} from '@/domain/frame/frame';
import { Avatar } from './Avatar';
import styles from './PrivateFrame.module.css';
import { StatusPill } from './StatusPill';
import { TalkToAPerson } from './TalkToAPerson';
import { WordmarkImage } from './Wordmark';

/**
 * The frame of every page reached by a private link (UX-PP-1 to UX-PP-10), in two variants.
 *
 * A renter's or a tenant's page: Gaff's wordmark and "Talk to a person"; the home; the page's one
 * task; what happens next, once, after the task; then the lister's name, its PSRA licence where
 * it has one, and the privacy notice.
 *
 * An owner's or a referee's page (UX-PP-9, Q45): the same frame with the agency's name in the
 * header and "Run with Gaff" as one quiet line in the footer. Nothing invites them to use Gaff.
 *
 * The frame adds no line of caution and no standing disclaimer (UX-PP-6, Q46), and it no longer
 * says an AI assistant helps on every page: the first message says so (rule 6), and anything the
 * assistant wrote that a page shows is marked with `FromAssistant` (UX-AI-1).
 */
export function PrivateFrame({
  audience,
  lister,
  home,
  homeHeading = 'h1',
  next,
  wide,
  children,
}: {
  audience: FrameAudience;
  /** Whoever lets the home. Null only where a link has ended and names nobody. */
  lister: Lister | null;
  /** The home the page is about. Left out where the page isn't about one (a reference). */
  home?: FrameHome;
  /** The address is the page's title unless the page has a title of its own. */
  homeHeading?: 'h1' | 'p';
  /** What happens next, and when: shown once, after the task (UX-PP-2). */
  next?: ReactNode;
  /** A wider column, for an owner's page that holds a table. */
  wide?: boolean;
  children: ReactNode;
}) {
  const header = frameHeader(audience, lister);
  const footer = frameFooter(audience, lister);
  const reach = reachAPerson(lister);
  const inner = `${styles.inner} ${wide ? styles.wide : ''}`;
  const footerLines = footer.listerName !== null || footer.runWithGaff;
  return (
    // Comfortable density: body-size help text (Field reads it). Controls are 48px everywhere.
    <div className={styles.page} data-density="comfortable">
      <header className={styles.header}>
        <div className={`${inner} ${styles.headerInner}`}>
          {header.brand === 'wordmark' ? (
            <WordmarkImage />
          ) : (
            <div className={styles.lister}>
              <Avatar name={header.name} tone="strong" />
              <p className={styles.listerName}>{header.name}</p>
            </div>
          )}
          {header.talkToAPerson ? (
            <TalkToAPerson listerName={lister?.name ?? null} phone={reach.phone} />
          ) : null}
        </div>
      </header>
      <main className={styles.main}>
        <div className={`${inner} ${styles.column}`}>
          {home ? <HomeBlock home={home} lister={lister} heading={homeHeading} /> : null}
          {children}
          {next ? <WhatHappensNext>{next}</WhatHappensNext> : null}
        </div>
      </main>
      {footerLines ? (
        <footer className={styles.footer}>
          <div className={`${inner} ${styles.footerInner}`}>
            {footer.listerName ? (
              <p>
                <span className={styles.footerName}>{footer.listerName}</span>
                {footer.licence ? ` · ${frameCopy.licence(footer.licence)}` : null}
              </p>
            ) : null}
            {footer.reachLister && footer.listerName ? (
              <p>{frameCopy.reachLister(footer.listerName, reach.phone?.shown ?? null)}</p>
            ) : null}
            {footer.privacyHref ? (
              <Link href={footer.privacyHref} className={styles.footerLink}>
                {frameCopy.privacy}
              </Link>
            ) : null}
            {footer.runWithGaff ? <p>{frameCopy.runWithGaff}</p> : null}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/**
 * The home the page is about: the cover photo's slot, the address, one summary line that fits
 * the stage (UX-PP-5), and who lets it. Homes have no photos yet, so the slot shows the neutral
 * placeholder (UX-DS-10). When a home has a public page, this block links to it.
 */
function HomeBlock({
  home,
  lister,
  heading: Heading,
}: {
  home: FrameHome;
  lister: Lister | null;
  heading: 'h1' | 'p';
}) {
  return (
    <div className={styles.home}>
      <span className={styles.photo} aria-hidden="true">
        <House size={24} strokeWidth={1.75} />
      </span>
      <div className={styles.address}>
        <Heading className={styles.addressLine}>{home.addressLine1}</Heading>
        <p className={styles.area}>{home.area}</p>
      </div>
      <div className={styles.homeFacts}>
        <p className={styles.summary}>{homeSummaryLine(home)}</p>
        {lister ? <p className={styles.letBy}>{frameCopy.letBy(lister.name)}</p> : null}
      </div>
    </div>
  );
}

/** UX-PP-2: what happens next and when, in one place, after the task. */
export function WhatHappensNext({ children }: { children: ReactNode }) {
  return (
    <div className={styles.next}>
      <p className={styles.nextTitle}>{frameCopy.whatHappensNext}</p>
      {children}
    </div>
  );
}

/**
 * UX-AI-1 (rule 6): anything the assistant wrote that a page shows is marked as the assistant's,
 * in words with the AI mark, never by colour alone. To a renter it is the lister's assistant
 * (UX-AI-15): "From Halcyon Lettings’ AI assistant".
 */
export function FromAssistant({
  listerName,
  children,
}: {
  listerName: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.assistant}>
      <StatusPill tone="ai" large>
        {fromAssistant(listerName)}
      </StatusPill>
      {children}
    </div>
  );
}
