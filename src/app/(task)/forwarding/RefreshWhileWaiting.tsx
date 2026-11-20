'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * UX-LT-18, UX-LT-19: while a screen waits for an email to arrive (a confirmation, the test coming
 * back), it looks again every few seconds, so what arrives shows without a reload. It stops after
 * ten minutes: by then the screen says what to do, and "Check again" is there. Nothing moves on
 * screen while it waits.
 */
export function RefreshWhileWaiting({
  everySeconds = 4,
  forMinutes = 10,
}: {
  everySeconds?: number;
  forMinutes?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const until = Date.now() + forMinutes * 60_000;
    const timer = window.setInterval(() => {
      if (Date.now() > until) {
        window.clearInterval(timer);
        return;
      }
      if (document.visibilityState === 'visible') router.refresh();
    }, everySeconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, everySeconds, forMinutes]);
  return null;
}
