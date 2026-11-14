import type { MapEvent } from '@/domain/map/counts';

/**
 * M133: counts one use of the map, by day, through the page's own beacon. A fixed code, with
 * nothing about the renter, their device, the area or the search. No cookies.
 */
export function countMap(event: MapEvent, kind = ''): void {
  const url = `/api/v?m=${event}${kind ? `&k=${kind}` : ''}`;
  try {
    if (!navigator.sendBeacon?.(url)) void fetch(url, { method: 'POST', keepalive: true });
  } catch {
    // Counting never gets in the map's way.
  }
}

/** Where the map opened: on its own (phones and tablets), or beside the list. */
export function openKind(): 'phone' | 'larger' {
  return window.matchMedia('(width >= 1128px)').matches ? 'larger' : 'phone';
}
