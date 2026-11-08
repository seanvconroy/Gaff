'use client';

import { List, Map as MapIcon } from 'lucide-react';
import { useSearchNavigation } from '../navigation';
import { hrefFor, type ClientSearch } from '../state';
import styles from '../search.module.css';

/**
 * M57: on phones and tablets, a floating button between the list and the map. The web address
 * remembers the view, so Back returns to the list.
 */
export function MapToggle({ search }: { search: ClientSearch }) {
  const { navigate } = useSearchNavigation();
  const toMap = search.view !== 'map';
  const href = hrefFor(search, search.filters, toMap ? 'map' : 'list');
  return (
    <a
      href={href}
      className={styles.mapToggle}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
    >
      {toMap ? (
        <MapIcon size={20} strokeWidth={2} aria-hidden="true" />
      ) : (
        <List size={20} strokeWidth={2} aria-hidden="true" />
      )}
      {toMap ? 'Map' : 'List'}
    </a>
  );
}
