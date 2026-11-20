'use client';

import { useEffect, useRef } from 'react';
import styles from './Thread.module.css';

/**
 * Opens a conversation at its latest, as a messaging app does: when the foot of the thread is
 * below the screen, the page moves to it, at once and with no animation. The reply box sits
 * just above this mark, so a draft's "Send" is in reach as soon as the conversation opens.
 */
export function OpenAtLatest({ conversation }: { conversation: string }) {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const foot = mark.current;
    if (!foot || foot.getBoundingClientRect().bottom <= window.innerHeight) return;
    foot.scrollIntoView({ block: 'end', behavior: 'instant' });
  }, [conversation]);
  return <span ref={mark} className={styles.latest} aria-hidden="true" />;
}
