import type { Metadata } from 'next';
import { codeShownCopy } from '@/copy/sign-in';
import { formatTime } from '@/lib/format';
import { openCodeLink } from '@/server/auth/codes';
import { ButtonLink } from '@/ui/Button';
import styles from '../sign-in.module.css';

export const metadata: Metadata = { title: codeShownCopy.title, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/**
 * UX-SI-3: the email's button, opened somewhere other than where the person started. It shows
 * the code in large type and signs nobody in. Looking uses nothing up: the code still works,
 * once, in the browser that asked for it.
 */
export default async function YourCodePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t: token = '' } = await searchParams;
  // No browser key is passed, so this can only ever show the code, never use it.
  const opened = await openCodeLink({ purpose: 'sign_in', token, browserKey: null });
  if (opened.where !== 'elsewhere') {
    return (
      <div className={styles.screen}>
        <div className={styles.title}>
          <h1 className="type-heading">{codeShownCopy.goneTitle}</h1>
          <p className={styles.lead}>{codeShownCopy.gone}</p>
        </div>
        <ButtonLink href="/sign-in" variant="primary" fullWidth>
          {codeShownCopy.startAgain}
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <div className={styles.title}>
        <h1 className="type-heading">{codeShownCopy.title}</h1>
        <p className={styles.lead}>{codeShownCopy.lead}</p>
      </div>
      <p className={styles.shownCode} aria-label={opened.code.split('').join(' ')}>
        {opened.code}
      </p>
      <p className={styles.lead}>{codeShownCopy.until(formatTime(opened.expiresAt))}</p>
    </div>
  );
}
