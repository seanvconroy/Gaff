'use client';

import { Heart } from 'lucide-react';
import styles from './HeartButton.module.css';

/**
 * The heart on a home's card (section 8, "Home card"; UX-SR-6): saves the home, or takes it off
 * the saved list. A 44px round button over the photo's corner, named by the home it saves, and
 * pressed or not in words for a screen reader (`aria-pressed`), filled when saved.
 */
export function HeartButton({
  label,
  saved = false,
  onPress,
}: {
  /** "Save 2-bed apartment · Ranelagh, Dublin 6". */
  label: string;
  saved?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.heart}
      aria-label={label}
      aria-pressed={saved}
      onClick={onPress}
    >
      <Heart
        size={20}
        strokeWidth={1.75}
        aria-hidden="true"
        className={saved ? styles.filled : undefined}
      />
    </button>
  );
}
