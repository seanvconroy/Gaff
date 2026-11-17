'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import styles from './FilterChips.module.css';

/**
 * What a search understood, as chips (section 8, "Search box with chips"; UX-SR-3): first a
 * "Filters" chip, which opens all of them as ordinary controls, then one chip per filter, which
 * opens that one. On a phone the row scrolls sideways with a fade; on a desktop it wraps. Each
 * chip is 36px to look at and 44px to press.
 */
export function FilterChips({
  label,
  filtersLabel,
  chips,
  onFilters,
  onChip,
}: {
  /** What the row is, for screen readers: "What Gaff understood". */
  label: string;
  filtersLabel: string;
  chips: ReadonlyArray<{ key: string; label: string }>;
  onFilters: () => void;
  onChip: (key: string) => void;
}) {
  return (
    <div className={styles.scroller}>
      <ul className={styles.row} aria-label={label}>
        <li>
          <button type="button" className={styles.chip} onClick={onFilters}>
            <SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" />
            <span>{filtersLabel}</span>
          </button>
        </li>
        {chips.map((chip) => (
          <li key={chip.key}>
            <button
              type="button"
              className={`${styles.chip} ${styles.applied}`}
              aria-haspopup="dialog"
              onClick={() => onChip(chip.key)}
            >
              <span>{chip.label}</span>
              <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
