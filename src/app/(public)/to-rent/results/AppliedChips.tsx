import { X } from 'lucide-react';
import Link from 'next/link';
import type { Filters } from '@/domain/search/filters';
import { filterChips, noFilters, withoutChip } from '@/domain/search/labels';
import type { SearchArea } from '@/domain/search/places';
import { searchHref, type View } from '@/domain/search/url';
import styles from '../search.module.css';

/**
 * M115: every filter that's on, as a chip that removes it, and "Clear all" after two or more.
 * Plain links, so they work without JavaScript.
 */
export function AppliedChips({
  area,
  filters,
  view,
}: {
  area: SearchArea;
  filters: Filters;
  view: View;
}) {
  const chips = filterChips(filters);
  if (chips.length === 0) return null;
  return (
    <ul className={styles.applied} aria-label="Filters that are on">
      {chips.map((chip) => (
        <li key={`${chip.keys.join('-')}-${chip.label}`}>
          <Link
            href={searchHref(area, withoutChip(filters, chip), view)}
            className={styles.appliedChip}
            scroll={false}
          >
            <span>{chip.label}</span>
            <X size={16} strokeWidth={2.25} aria-hidden="true" />
            <span className="visually-hidden">: remove this filter</span>
          </Link>
        </li>
      ))}
      {chips.length >= 2 ? (
        <li>
          <Link
            href={searchHref(area, noFilters(filters), view)}
            className={styles.clearLink}
            scroll={false}
          >
            Clear all
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
