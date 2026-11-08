'use client';

import { ArrowUpDown } from 'lucide-react';
import { sortWords } from '@/copy/search';
import type { Sort } from '@/domain/search/filters';
import { useSearchNavigation } from '../navigation';
import { hrefFor, type ClientSearch } from '../state';
import styles from '../search.module.css';

/** M59: the order, beside the results (a native select: easy on phones and with keyboards). */
export function SortMenu({ search }: { search: ClientSearch }) {
  const { navigate } = useSearchNavigation();
  return (
    <label className={styles.sort}>
      <ArrowUpDown size={18} strokeWidth={2} aria-hidden="true" />
      <span>Sort:</span>
      <select
        value={search.filters.sort}
        onChange={(event) =>
          navigate(hrefFor(search, { ...search.filters, sort: event.target.value as Sort }))
        }
      >
        {Object.entries(sortWords).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
