/// <reference types="google.maps" />
'use client';

import { APIProvider, useApiIsLoaded, useMap } from '@vis.gl/react-google-maps';
import { useCallback, useEffect, type ReactNode } from 'react';
import type { MapFailure } from '@/domain/map/counts';
import type { MapSettings } from '@/lib/map';
import { documentShowsMaps, reloading } from './MapBoundary';

/**
 * ADR-0027: loads Google's Maps JavaScript API, and notices every way it can fail (M120), so
 * Gaff's own sentence replaces Google's error box:
 *
 * - `script`: the script didn't arrive (a blocker, the network, the content security policy);
 * - `auth`: Google refused the key. `gm_authFailure` is Google's documented hook for it;
 * - `google`: Google drew its own error in place of the map. In development mode (billing, or
 *   the daily cap) Google still draws tiles, darkened, under a dialog, and calls no hook, so
 *   the map's own element is watched for Google's error views;
 * - `timeout`: nothing appeared in time.
 *
 * Google is told only the site's origin when it authorises the key (`auth_referrer_policy`),
 * never the page's address: the address names the place a renter searched (M119).
 *
 * The script is asked for only in a document loaded for a page that shows the map: any other
 * document's content security policy would refuse it (MapBoundary).
 */

export type GoogleSettings = Extract<MapSettings, { provider: 'google' }>;

/** The script has this long to load, and the map this long to draw, before Gaff says so. */
const SCRIPT_TIMEOUT_MS = 20_000;
const TILES_TIMEOUT_MS = 10_000;

/** Google's own error views, inside the map: its error box, and its development-mode dialog. */
const GOOGLE_ERROR_VIEWS = '.gm-err-container, .dismissButton';

const NO_LIBRARIES: string[] = [];

type AuthHook = Window & { gm_authFailure?: () => void };

function ScriptWatch({ onFailed }: { onFailed: (kind: MapFailure) => void }) {
  const loaded = useApiIsLoaded();
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => onFailed('timeout'), SCRIPT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded, onFailed]);
  return null;
}

export function GoogleLoader({
  settings,
  onFailed,
  children,
}: {
  settings: GoogleSettings;
  /** Must keep its identity between renders: it's a dependency of the loader's effects. */
  onFailed: (kind: MapFailure) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const hook = window as AuthHook;
    const before = hook.gm_authFailure;
    hook.gm_authFailure = () => onFailed('auth');
    return () => {
      hook.gm_authFailure = before;
    };
  }, [onFailed]);
  const onError = useCallback(() => onFailed('script'), [onFailed]);
  // A page swapped in from one without the map is about to load again, with its own document:
  // nothing is asked of Google until then. A map on a page that isn't one of the map's pages
  // (src/lib/map-pages.ts) can't load at all, and says so.
  const allowed = documentShowsMaps();
  useEffect(() => {
    if (!allowed && !reloading()) onFailed('script');
  }, [allowed, onFailed]);
  if (!allowed) return null;
  return (
    <APIProvider
      apiKey={settings.apiKey}
      version={settings.version}
      libraries={NO_LIBRARIES}
      language="en"
      region="IE"
      authReferrerPolicy="origin"
      // The library's own usage tags for Google: not needed to draw a map, so not sent.
      solutionChannel=""
      disableUsageAttribution
      onError={onError}
    >
      <ScriptWatch onFailed={onFailed} />
      {children}
    </APIProvider>
  );
}

/**
 * Inside a <Map>: says when the map has drawn (M131), and when Google has drawn an error or
 * nothing at all (M120).
 */
export function MapWatch({
  onReady,
  onFailed,
}: {
  onReady: () => void;
  onFailed: (kind: MapFailure) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const element = map.getDiv();
    let drawn = false;
    let failed = false;
    const googleError = () => element.querySelector(GOOGLE_ERROR_VIEWS) !== null;
    const check = () => {
      if (failed || !googleError()) return;
      failed = true;
      onFailed('google');
    };
    const observer = new MutationObserver(check);
    observer.observe(element, { childList: true, subtree: true });
    check();
    const tiles = map.addListener('tilesloaded', () => {
      if (drawn || failed) return;
      drawn = true;
      // Google's dialog can arrive with the tiles: give it a moment before calling the map ready.
      requestAnimationFrame(() => {
        check();
        if (!failed) onReady();
      });
    });
    const watchdog = setTimeout(() => {
      if (drawn || failed) return;
      failed = true;
      onFailed('timeout');
    }, TILES_TIMEOUT_MS);
    return () => {
      observer.disconnect();
      tiles.remove();
      clearTimeout(watchdog);
    };
  }, [map, onReady, onFailed]);
  return null;
}

export const literal = (box: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}): google.maps.LatLngBoundsLiteral => ({
  north: box.maxLat,
  south: box.minLat,
  east: box.maxLng,
  west: box.minLng,
});
