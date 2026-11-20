'use client';

import { useEffect } from 'react';

/**
 * M92: tells Gaff the page was opened, once, through the page's own beacon, for the lister's
 * daily count. No cookies, and nothing about who: the count is a number for the day.
 */
export function PageOpened({ homeRef }: { homeRef: string }) {
  useEffect(() => {
    const url = `/api/homes/${homeRef}/opened`;
    try {
      if (!navigator.sendBeacon?.(url)) void fetch(url, { method: 'POST', keepalive: true });
    } catch {
      // Counting never gets in the page's way.
    }
  }, [homeRef]);
  return null;
}
