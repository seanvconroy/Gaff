'use client';

import { useSyncExternalStore } from 'react';
import { resolveTheme, type Scheme } from '@/domain/map/theme';

/**
 * M130: the page's theme, as the tokens' stylesheet decides it (`data-theme` on the page, then
 * the device), kept up to date when either changes.
 */
function subscribe(changed: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', changed);
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    media.removeEventListener('change', changed);
    observer.disconnect();
  };
}

const read = (): Scheme =>
  resolveTheme(
    document.documentElement.getAttribute('data-theme'),
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

export function usePageScheme(): Scheme {
  return useSyncExternalStore(subscribe, read, () => 'light');
}
