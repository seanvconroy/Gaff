import { dublinDistricts } from './eircode';
import { places, type Place } from './gazetteer';
import type { Point } from './geo';
import { slugify } from './slug';

/**
 * M38: an approximate location for a home, from its area, routing key and county, until the
 * letter places a pin on the map (milestone 4). The best match is the most specific named area
 * in the address; then the Dublin district; then the county.
 */
export function approximateLocation(home: {
  area: string;
  county: string;
  routingKey: string | null;
}): { point: Point; source: 'area' | 'district' | 'county'; place: Place } {
  const words = ` ${slugify(home.area).replace(/-/g, ' ')} `;
  const candidates = places
    .filter((p) => (p.kind === 'area' || p.kind === 'town') && p.county === home.county)
    .flatMap((p) =>
      [p.name, ...(p.aliases ?? [])].map((name) => ({
        place: p,
        name: slugify(name).replace(/-/g, ' '),
      })),
    )
    .filter(({ name }) => name && words.includes(` ${name} `))
    .sort((a, b) => b.name.length - a.name.length);
  if (candidates[0]) {
    return { point: candidates[0].place.centre, source: 'area', place: candidates[0].place };
  }
  const district = dublinDistricts.find((d) => d.routingKey === home.routingKey);
  const districtPlace = district && places.find((p) => p.routingKey === district.routingKey);
  if (districtPlace)
    return { point: districtPlace.centre, source: 'district', place: districtPlace };
  const county = places.find((p) => p.kind === 'county' && p.name === home.county)!;
  return { point: county.centre, source: 'county', place: county };
}
