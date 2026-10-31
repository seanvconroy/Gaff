'use client';

import { useEffect } from 'react';
import { countsAsActive } from '@/domain/dashboard/time';

const LETTING_PAGE = /^\/lettings\/([0-9a-f-]{36})(?:\/|$)/i;
const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const;

/**
 * R28, Q15: once a minute, while someone is actively using the workspace (input in the last
 * 2 minutes, tab in view), tells Gaff which letting they're on. That's all it sends.
 */
export function ActivityTracker() {
  useEffect(() => {
    let lastInputAt = new Date();
    const onInput = () => {
      lastInputAt = new Date();
    };
    for (const input of INPUTS) window.addEventListener(input, onInput, { passive: true });
    const timer = window.setInterval(() => {
      const visible = document.visibilityState === 'visible';
      if (!countsAsActive({ lastInputAt, now: new Date(), visible })) return;
      const lettingId = LETTING_PAGE.exec(window.location.pathname)?.[1] ?? null;
      void fetch('/api/activity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lettingId }),
        keepalive: true,
      }).catch(() => undefined);
    }, 60_000);
    return () => {
      window.clearInterval(timer);
      for (const input of INPUTS) window.removeEventListener(input, onInput);
    };
  }, []);
  return null;
}
