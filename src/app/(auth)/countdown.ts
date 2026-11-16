'use client';

import { useEffect, useState } from 'react';

/**
 * Seconds left of a countdown that started at `from` when `stamp` was made: the wait before
 * "Send a new code" unlocks (UX-SI-2). It restarts whenever `stamp` changes.
 */
export function useCountdown(from: number, stamp: number): number {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    const started = Date.now();
    const tick = () => setLeft(Math.max(0, from - Math.floor((Date.now() - started) / 1000)));
    const first = setTimeout(tick, 0);
    const timer = from > 0 ? setInterval(tick, 500) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [from, stamp]);
  return left;
}
