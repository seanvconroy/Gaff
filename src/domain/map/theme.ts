/**
 * M129, M130: the map's colours. The page's theme is decided the way the tokens' stylesheet
 * decides it: `data-theme` on the page wins, then the device's setting. The map is dark only
 * when the page is dark and a dark map is ready; pins and clusters follow the map, not the page,
 * so a light map on a dark page keeps light pins.
 */
export type Scheme = 'light' | 'dark';

export function resolveTheme(dataTheme: string | null | undefined, prefersDark: boolean): Scheme {
  if (dataTheme === 'light' || dataTheme === 'dark') return dataTheme;
  return prefersDark ? 'dark' : 'light';
}

export function mapScheme(page: Scheme, darkMapReady: boolean): Scheme {
  return page === 'dark' && darkMapReady ? 'dark' : 'light';
}
