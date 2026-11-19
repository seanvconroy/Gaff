'use client';

import { List, Map as MapIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import styles from './ListAndMap.module.css';

/**
 * M57, UX-SR-8: a list and its map. At 900px and up the list sits beside the map, which stays in
 * view as the list scrolls. Below it, one control switches between the two: the list first,
 * complete without the map, and the map only when asked for (so it loads only then: M119).
 */
export function ListAndMap({
  list,
  map,
  words,
}: {
  list: ReactNode;
  map: ReactNode;
  words: { showMap: string; showList: string };
}) {
  const [view, setView] = useState<'list' | 'map'>('list');
  const toMap = view === 'list';
  return (
    <div className={styles.layout} data-view={view}>
      <div className={styles.list}>{list}</div>
      <div className={styles.map}>{map}</div>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => {
          setView(toMap ? 'map' : 'list');
          window.scrollTo({ top: 0 });
        }}
      >
        {toMap ? (
          <MapIcon size={20} strokeWidth={2} aria-hidden="true" />
        ) : (
          <List size={20} strokeWidth={2} aria-hidden="true" />
        )}
        {toMap ? words.showMap : words.showList}
      </button>
    </div>
  );
}
