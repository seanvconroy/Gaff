import { Bell, Check } from 'lucide-react';
import Link from 'next/link';
import styles from './bar.module.css';

/**
 * M86: "Save search", or "Saved" with a check once the renter has an alert for this search.
 * Saving needs an account, so a renter who isn't signed in signs in and comes back.
 */
export function SaveSearch({
  saved,
  saveAction,
  className,
}: {
  saved: boolean;
  saveAction: () => Promise<void>;
  className?: string;
}) {
  if (saved) {
    return (
      <Link
        href="/my/alerts"
        className={`${styles.saveSearch} ${className ?? ''}`}
        aria-label="Saved: see your alerts"
      >
        <Check size={18} strokeWidth={2} aria-hidden="true" />
        <span>Saved</span>
      </Link>
    );
  }
  return (
    <form action={saveAction} className={className}>
      <button type="submit" className={styles.saveSearch}>
        <Bell size={18} strokeWidth={2} aria-hidden="true" />
        <span>Save search</span>
      </button>
    </form>
  );
}
