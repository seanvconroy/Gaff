'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { MapArea } from '@/domain/map/camera';
import type { MapEvent } from '@/domain/map/counts';
import type { BBox } from '@/domain/places/geo';
import { searchHref, writeBBox, type SearchFilters } from '@/domain/search/filters';
import type { Shape } from '@/domain/search/shapes';
import type { MapSettings } from '@/lib/map';
import { openPage } from '@/ui/MapBoundary';
import { type MapCardData, type MapPins, SearchMap } from '@/ui/SearchMap';

/**
 * M57, M117, M133: the search's map, wired to the page. Its pins come from the search's own
 * address (the filters, never what was typed), a pin's card from the home's public reference,
 * and moving the map, or drawing on it, makes a new search with the map area or the drawn areas
 * in place of the place (Q60, UX-SR-13). A card in the list and its pin light each other up.
 * Each use of the map is counted as a fixed code.
 */

/** M133: one use of the map, through the page's own beacon. No cookies; never the search. */
function countMap(event: MapEvent, kind = ''): void {
  const url = `/api/map/count?m=${event}${kind ? `&k=${kind}` : ''}`;
  try {
    if (!navigator.sendBeacon?.(url)) void fetch(url, { method: 'POST', keepalive: true });
  } catch {
    // Counting never gets in the map's way.
  }
}

/** Where the map opened: on its own (below 900px), or beside the list. */
function openKind(): 'phone' | 'larger' {
  return window.matchMedia('(width > 900px)').matches ? 'larger' : 'phone';
}

export function ResultsMap({
  settings,
  area,
  query,
  filters,
  keepRent,
}: {
  settings: MapSettings;
  area: MapArea;
  /** The search's own address, as its query string: the filters' values and nothing else. */
  query: string;
  filters: SearchFilters;
  keepRent: boolean;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  const loadPins = useCallback(
    async (view: BBox, signal: AbortSignal): Promise<MapPins | null> => {
      const response = await fetch(
        `/api/search/points?${query ? `${query}&` : ''}view=${writeBBox(view)}`,
        { signal },
      );
      return response.ok ? ((await response.json()) as MapPins) : null;
    },
    [query],
  );
  const loadCard = useCallback(async (id: string): Promise<MapCardData | null> => {
    const response = await fetch(`/api/search/card?id=${encodeURIComponent(id)}`);
    return response.ok ? ((await response.json()) as MapCardData) : null;
  }, []);
  /**
   * The search's place gives way to what the map says: the area in view, or the areas drawn on
   * it. The first step away from a place is a new entry in the browser's history, so Back
   * returns to the place; every move after that replaces it, so Back isn't a replay of the map.
   */
  const searchWhere = useCallback(
    (area: { box: BBox } | { shapes: Shape[] }) => {
      const { where, within: _within, box: _box, shapes: _shapes, ...rest } = filters;
      const href = searchHref({ ...rest, ...area }, { rent: keepRent });
      if (where || window.location.pathname !== '/') openPage(router, href);
      else router.replace(href, { scroll: false });
    },
    [filters, keepRent, router],
  );
  const onSearchArea = useCallback((box: BBox) => searchWhere({ box }), [searchWhere]);
  const onShapes = useCallback((shapes: Shape[]) => searchWhere({ shapes }), [searchWhere]);

  // A card pointed at in the list lights its pin; a pin pointed at lights its card (M117).
  useEffect(() => {
    const homeOf = (target: EventTarget | null) =>
      target instanceof Element
        ? (target.closest('[data-home]')?.getAttribute('data-home') ?? null)
        : null;
    const over = (event: Event) => {
      const home = homeOf(event.target);
      if (home) setHovered(home);
    };
    const out = (event: Event) => {
      const from = homeOf(event.target);
      const to = homeOf((event as PointerEvent | FocusEvent).relatedTarget);
      if (from && from !== to) setHovered(null);
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('focusin', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusout', out);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('focusin', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusout', out);
    };
  }, []);
  useEffect(() => {
    for (const card of document.querySelectorAll('[data-home]')) {
      card.toggleAttribute('data-lit', card.getAttribute('data-home') === hovered);
    }
  }, [hovered]);

  return (
    <SearchMap
      settings={settings}
      area={area}
      loadPins={loadPins}
      loadCard={loadCard}
      onSearchArea={onSearchArea}
      onShapes={onShapes}
      hovered={hovered}
      onHover={setHovered}
      count={countMap}
      openKind={openKind}
    />
  );
}
