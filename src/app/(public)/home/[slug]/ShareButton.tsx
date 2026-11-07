'use client';

import { Share2 } from 'lucide-react';
import { useState } from 'react';
import styles from './listing.module.css';

/** M73: share a home: the phone's own share sheet, or the link copied. */
export function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // The renter closed the share sheet: nothing to do.
    }
  }
  return (
    <p className={styles.share}>
      <button type="button" className={styles.textButton} onClick={share}>
        <Share2 size={20} strokeWidth={1.5} aria-hidden="true" />
        Share this home
      </button>
      <span aria-live="polite">{copied ? 'Link copied.' : ''}</span>
    </p>
  );
}
