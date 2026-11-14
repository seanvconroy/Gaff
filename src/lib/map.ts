import { env } from '@/lib/env';

/**
 * ADR-0027: which map this deployment shows. Google's (the Maps JavaScript API only), the
 * stand-in drawn from Gaff's own data (tests, development, and the test copy without a key), or
 * none (M135: the list alone, and nothing to place a pin on).
 */
export type MapSettings =
  | { provider: 'static' }
  | {
      provider: 'google';
      /** Public by design: restricted to Gaff's websites and to the Maps JavaScript API. */
      apiKey: string;
      mapId: string;
      /** M130: a Map ID that's styled dark. Without one, the map stays light in both themes. */
      mapIdDark?: string;
      /** Google's release channel: "quarterly" changes least often. */
      version: string;
    };

export function mapSettings(): MapSettings | null {
  const config = env();
  if (config.MAP_PROVIDER === 'none') return null;
  if (config.MAP_PROVIDER === 'google') {
    return {
      provider: 'google',
      apiKey: config.GOOGLE_MAPS_API_KEY!,
      mapId: config.GOOGLE_MAPS_MAP_ID!,
      ...(config.GOOGLE_MAPS_MAP_ID_DARK ? { mapIdDark: config.GOOGLE_MAPS_MAP_ID_DARK } : {}),
      version: config.GOOGLE_MAPS_VERSION,
    };
  }
  return { provider: 'static' };
}
