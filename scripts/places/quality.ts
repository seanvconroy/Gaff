import { counties } from '@/domain/lettings/new-letting';
import { curatedPlaces } from '@/domain/places/fixture';
import type { PlaceFileHeader } from '@/domain/places/file';
import type { Place, PlaceKind } from '@/domain/places/gazetteer';
import { IRELAND, inBBox } from '@/domain/places/geo';
import { normalise } from '@/domain/places/normalise';

/**
 * ADR-0025: what a built place index must pass before it's committed (`pnpm places:check`).
 * The checks are pure, so they're tested here; check.ts runs them on the real file.
 */

/** One place renters must find: what they type, and where the place must come in the list. */
export interface Expectation {
  query: string;
  /** Words the suggestion's name must contain, such as "Heuston". */
  name: string;
  /** Words its context or county must contain, such as "Dublin"; empty for any. */
  where: string;
  /** It must be among the first this many suggestions. */
  within: number;
}

/** The test set: a CSV of query, name, where and within, with # comments and blank lines. */
export function readTestSet(csv: string): Expectation[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const [head, ...rows] = lines;
  if (head !== 'query,name,where,within') {
    throw new Error('The test set starts with the line: query,name,where,within');
  }
  return rows.map((line, i) => {
    const [query = '', name = '', where = '', within = ''] = line.split(',').map((v) => v.trim());
    const n = Number(within);
    if (!query || !name || !Number.isInteger(n) || n < 1) {
      throw new Error(`Test set line ${i + 2} isn't query,name,where,within: ${line}`);
    }
    return { query, name, where, within: n };
  });
}

/**
 * The fewest of each kind a whole index of the Republic should have. Far below what OSM holds,
 * so they catch a broken build (a filter that matched nothing), not a quiet quarter.
 */
export const MINIMUM_OF_KIND: Partial<Record<PlaceKind, number>> = {
  county: 26,
  town: 100,
  village: 500,
  area: 100,
  street: 10_000,
  landmark: 100,
};

/** Problems with the file as a whole: its count, slugs, counties, curated places and bounds. */
export function checkPlaces(
  header: PlaceFileHeader,
  places: readonly Place[],
  minimum: Partial<Record<PlaceKind, number>> = MINIMUM_OF_KIND,
): string[] {
  const problems: string[] = [];
  if (header.count !== places.length) {
    problems.push(`The header says ${header.count} places, but the file has ${places.length}.`);
  }
  if (!header.attribution.some((a) => a.includes('OpenStreetMap contributors'))) {
    problems.push('The header has no OpenStreetMap attribution.');
  }
  const slugs = new Set<string>();
  const repeated = new Set<string>();
  for (const p of places) (slugs.has(p.slug) ? repeated : slugs).add(p.slug);
  if (repeated.size) problems.push(`Slugs used twice: ${[...repeated].slice(0, 10).join(', ')}.`);

  const countyNames = new Set(places.filter((p) => p.kind === 'county').map((p) => p.county));
  const missingCounties = counties.filter((c) => !countyNames.has(c));
  if (missingCounties.length) problems.push(`Counties missing: ${missingCounties.join(', ')}.`);

  // Area pages' addresses must never change, so every hand-picked place keeps its slug.
  const missingCurated = curatedPlaces.filter((p) => !slugs.has(p.slug)).map((p) => p.slug);
  if (missingCurated.length) {
    problems.push(`Curated places missing: ${missingCurated.slice(0, 10).join(', ')}.`);
  }

  const outside = places.filter((p) => !inBBox(p.centre, IRELAND)).map((p) => p.slug);
  if (outside.length) problems.push(`Places outside Ireland: ${outside.slice(0, 10).join(', ')}.`);

  const byKind = new Map<PlaceKind, number>();
  for (const p of places) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  for (const [kind, least] of Object.entries(minimum) as Array<[PlaceKind, number]>) {
    const n = byKind.get(kind) ?? 0;
    if (n < least) problems.push(`Only ${n} of kind ${kind}; expected at least ${least}.`);
  }
  return problems;
}

/** A suggestion as the check sees it, in the order the Where box shows them. */
export interface Shown {
  name: string;
  context: string | null;
  county: string | null;
}

/** Null when the expected place is among the first `within` suggestions; otherwise why not. */
export function checkExpectation(expected: Expectation, shown: readonly Shown[]): string | null {
  const name = normalise(expected.name);
  const where = normalise(expected.where);
  const at = shown.findIndex(
    (s) =>
      normalise(s.name).includes(name) &&
      normalise(`${s.context ?? ''} ${s.county ?? ''}`).includes(where),
  );
  if (at !== -1 && at < expected.within) return null;
  const list = shown
    .slice(0, 5)
    .map((s) => `${s.name}${s.context ? ` (${s.context})` : ''}`)
    .join('; ');
  const place = `${expected.name}${expected.where ? `, ${expected.where}` : ''}`;
  return at === -1
    ? `"${expected.query}" didn't suggest ${place}. It suggested: ${list || 'nothing'}.`
    : `"${expected.query}" suggested ${place} at ${at + 1}, not within ${expected.within}. First: ${list}.`;
}
