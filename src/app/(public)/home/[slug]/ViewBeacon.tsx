'use client';

import { useEffect } from 'react';

/** Counts one view of the listing (tech spec, Measurement): no cookies, nothing stored here. */
export function ViewBeacon({ listingId }: { listingId: string }) {
  useEffect(() => {
    const url = `/api/v?l=${encodeURIComponent(listingId)}`;
    if (!navigator.sendBeacon?.(url)) void fetch(url, { method: 'POST', keepalive: true });
  }, [listingId]);
  return null;
}
