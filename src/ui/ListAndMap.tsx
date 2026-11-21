'use client';

import { List, Map as MapIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import styles from './ListAndMap.module.css';

/**
 * M57, UX-SR-8: a list and its map, and the screen's two layouts for them.
 *
 * At 900px and up the screen is two columns. What's above the list (`head`: the search) and the
 * list are the left one, and scroll with the page. The map is the right one: it starts under the
 * navigation and is exactly as tall as the screen has left, so it is whole from the first moment
 * and never moves as the list scrolls.
 *
 * Below 900px one control switches between the two: the list first, complete without the map,
 * and the map only when asked for (so it loads only then: M119). The map then takes the list's
 * place under `head` and fills the rest of the screen, with the control at its foot; the shell
 * holds the page to the screen's height while it is open (`data-map-open`), so no part of the
 * map is ever off it.
 */
export function ListAndMap({
  head,
  list,
  map,
  words,
}: {
  /** What stays above the list and the map alike: the search bar and its chips. */
  head?: ReactNode;
  list: ReactNode;
  map: ReactNode;
  words: { showMap: string; showList: string };
}) {
  const [view, setView] = useState<'list' | 'map'>('list');
  const toMap = view === 'list';
  return (
    <div className={styles.layout} data-view={view} data-map-open={toMap ? undefined : ''}>
      <div className={styles.side}>
        {head ? <div className={styles.head}>{head}</div> : null}
        <div className={styles.list}>{list}</div>
      </div>
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
