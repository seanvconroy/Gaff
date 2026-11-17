/**
 * UX-SR-5: builds Gaff's own list of Irish places from OpenStreetMap, and writes it over
 * `src/domain/search/places-list.ts`. Run by hand, rarely, and commit the result:
 *
 *   pnpm exec tsx scripts/places/build-places.ts
 *
 * It asks Overpass (an OpenStreetMap query server) for each county's cities, towns, suburbs and
 * neighbourhoods. Only place names go one way, from OpenStreetMap to Gaff: nobody's search is
 * ever sent anywhere, at build time or after. Credit: "© OpenStreetMap contributors" (ODbL).
 *
 * NOT RUN YET. The build environment blocks OpenStreetMap's servers, so the list in the
 * repository is hand-made (see its header). Run this where they can be reached, look over the
 * diff, and keep the `cue` marks and Dublin districts, which this carries over from the list.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { counties } from '../../src/domain/lettings/new-letting';
import { countyPlaces } from '../../src/domain/search/places-list';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
type County = (typeof counties)[number];

interface OsmElement {
  tags?: Record<string, string>;
}

async function overpass(query: string): Promise<OsmElement[]> {
  const response = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: `[out:json][timeout:180];${query}` }),
  });
  if (!response.ok) throw new Error(`Overpass answered ${response.status}`);
  return ((await response.json()) as { elements: OsmElement[] }).elements;
}

/**
 * The counties' boundaries in OpenStreetMap are their councils (admin level 6): Dublin has four
 * and Cork, Galway, Limerick and Waterford two each. Each council belongs to the county it names
 * ("Dún Laoghaire-Rathdown", "Fingal" and "South Dublin" are Dublin).
 */
function countyOf(council: string): County | null {
  if (/fingal|rathdown|south dublin/i.test(council)) return 'Dublin';
  return counties.find((county) => council.toLowerCase().includes(county.toLowerCase())) ?? null;
}

async function build(): Promise<void> {
  const councils = await overpass(
    'area["ISO3166-1"="IE"]->.ie;rel(area.ie)["boundary"="administrative"]["admin_level"="6"];out tags;',
  );
  const towns = new Map<County, Set<string>>();
  const areas = new Map<County, Set<string>>();
  for (const council of councils) {
    const name = council.tags?.name;
    const county = name ? countyOf(name) : null;
    if (!name || !county) continue;
    const found = await overpass(
      `area["boundary"="administrative"]["admin_level"="6"]["name"="${name.replace(/"/g, '\\"')}"]->.c;` +
        'node(area.c)["place"~"^(city|town|suburb|quarter|neighbourhood)$"];out tags;',
    );
    for (const place of found) {
      const placeName = place.tags?.['name:en'] ?? place.tags?.name;
      if (!placeName || placeName.toLowerCase() === county.toLowerCase()) continue;
      const kind = /^(city|town)$/.test(place.tags?.place ?? '') ? towns : areas;
      if (!kind.has(county)) kind.set(county, new Set());
      kind.get(county)!.add(placeName);
    }
  }

  // Keep what the hand-made list knows that OpenStreetMap doesn't: cue marks and aliases.
  const known = new Map(
    counties.flatMap((county) =>
      [...countyPlaces[county].towns, ...(countyPlaces[county].areas ?? [])].map((p) => [
        `${county}:${p.name}`,
        p,
      ]),
    ),
  );
  const entry = (county: County, name: string) => {
    const before = known.get(`${county}:${name}`);
    const extra = {
      ...(before?.aliases ? { aliases: before.aliases } : {}),
      ...(before?.cue ? { cue: true } : {}),
      ...(before?.context ? { context: before.context } : {}),
    };
    return `t(${JSON.stringify(name)}${Object.keys(extra).length ? `, ${JSON.stringify(extra)}` : ''})`;
  };
  const body = counties
    .map((county) => {
      const own = countyPlaces[county];
      const list = (names: Set<string> | undefined) =>
        [...(names ?? [])]
          .sort()
          .map((name) => `      ${entry(county, name)},`)
          .join('\n');
      return [
        `  ${county}: {`,
        own.cue ? '    cue: true,' : '',
        `    towns: [\n${list(towns.get(county))}\n    ],`,
        `    areas: [\n${list(areas.get(county))}\n    ],`,
        '  },',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const path = new URL('../../src/domain/search/places-list.ts', import.meta.url);
  const current = readFileSync(path, 'utf8');
  const start = current.indexOf('> = {\n') + '> = {\n'.length;
  const end = current.indexOf('\n};\n', start);
  writeFileSync(path, `${current.slice(0, start)}${body}${current.slice(end)}`);
  console.log('Wrote src/domain/search/places-list.ts. Run `pnpm format`, then check the diff.');
}

await build();
