import { describe, expect, it } from 'vitest';
import {
  buildIndex,
  classify,
  Contexts,
  countyShape,
  mergeStreets,
  parseFeature,
  type Candidate,
  type Feature,
} from './lib';

/** A square "county" around a point, as OSM's boundary would come out of osmium. */
function countyFeature(name: string, lat: number, lng: number, half = 0.5): Feature {
  return {
    type: 'Feature',
    id: `r${name.length}`,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng - half, lat - half],
          [lng + half, lat - half],
          [lng + half, lat + half],
          [lng - half, lat + half],
          [lng - half, lat - half],
        ],
      ],
    },
    properties: { boundary: 'administrative', admin_level: '6', name },
  };
}

const node = (props: Record<string, string>, lat: number, lng: number): Feature => ({
  type: 'Feature',
  id: `n${Math.round(lat * 1e4)}${Math.round(-lng * 1e4)}`,
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: props,
});

const road = (name: string, points: Array<[number, number]>, highway = 'residential'): Feature => ({
  type: 'Feature',
  id: `w${points.length}${name.length}`,
  geometry: { type: 'LineString', coordinates: points.map(([lat, lng]) => [lng, lat]) },
  properties: { highway, name },
});

describe('ADR-0027: building the place index from OpenStreetMap', () => {
  it('reads osmium’s GeoJSON lines, with or without a record separator', () => {
    const line = JSON.stringify(node({ place: 'town', name: 'Kinsale' }, 51.7, -8.52));
    expect(parseFeature(`\x1e${line}`)?.properties.name).toBe('Kinsale');
    expect(parseFeature('not json')).toBeNull();
  });

  it('keeps only the Republic’s 26 counties', () => {
    expect(countyShape(countyFeature('County Cork', 51.9, -8.5))?.county).toBe('Cork');
    expect(countyShape(countyFeature('County Antrim', 54.7, -6.2))).toBeNull();
  });

  it('classifies places, townlands, landmarks and streets, and skips road numbers', () => {
    expect(
      classify(
        node(
          { place: 'town', name: 'Kinsale', 'name:ga': 'Cionn tSáile', population: '5991' },
          51.7,
          -8.52,
        ),
      ),
    ).toMatchObject({
      kind: 'town',
      irishName: 'Cionn tSáile',
      population: 5991,
      radiusMetres: 2000,
    });
    expect(classify(node({ place: 'hamlet', name: 'Ballyduff' }, 52, -8))).toMatchObject({
      kind: 'village',
      radiusMetres: 700,
    });
    expect(classify(node({ amenity: 'hospital', name: 'St Luke’s' }, 53.3, -6.3))).toMatchObject({
      kind: 'landmark',
      landmarkKind: 'hospital',
    });
    expect(classify(node({ railway: 'tram_stop', name: 'Ranelagh' }, 53.32, -6.25))).toMatchObject({
      landmarkKind: 'station',
    });
    expect(
      classify(
        road('Highfield Road', [
          [53.315, -6.272],
          [53.317, -6.262],
        ]),
      ),
    ).toMatchObject({
      kind: 'street',
    });
    expect(
      classify(
        road(
          'N4',
          [
            [53.3, -6.4],
            [53.35, -6.5],
          ],
          'primary',
        ),
      ),
    ).toBeNull();
    expect(
      classify(
        road(
          'A footpath',
          [
            [53.3, -6.4],
            [53.31, -6.4],
          ],
          'footway',
        ),
      ),
    ).toBeNull();
    expect(classify(node({ place: 'town' }, 51.7, -8.52))).toBeNull();
  });

  it('merges a street’s segments, but not a namesake in another town', () => {
    const segments = [
      road('Main Street', [
        [52.0, -8.0],
        [52.001, -8.0],
      ]),
      road('Main Street', [
        [52.0012, -8.0],
        [52.003, -8.0],
      ]),
      road('Main Street', [
        [53.0, -7.0],
        [53.001, -7.0],
      ]),
    ].map((f) => classify(f)!) as Candidate[];
    const merged = mergeStreets(segments);
    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.centre.lat < 52.5)!.line).toHaveLength(2);
  });

  it('gives streets a context: "Rathgar, Dublin 6", "Ballintemple, Cork"', () => {
    const contexts = Contexts.from([
      {
        kind: 'area',
        name: 'Rathgar',
        centre: { lat: 53.3138, lng: -6.274 },
        radiusMetres: 1000,
      } as Candidate,
      {
        kind: 'city',
        name: 'Cork city',
        centre: { lat: 51.8985, lng: -8.4756 },
        radiusMetres: 6000,
      } as Candidate,
      {
        kind: 'area',
        name: 'Ballintemple',
        centre: { lat: 51.894, lng: -8.43 },
        radiusMetres: 800,
        placeValue: 'suburb',
      } as Candidate,
    ]);
    expect(contexts.contextFor({ lat: 53.3156, lng: -6.2672 }, 'Dublin')).toEqual({
      context: 'Rathgar, Dublin 6',
      routingKey: 'D06',
    });
    expect(contexts.contextFor({ lat: 51.8935, lng: -8.429 }, 'Cork').context).toBe(
      'Ballintemple, Cork',
    );
    expect(contexts.contextFor({ lat: 52.5, lng: -9.5 }, 'Kerry').context).toBe('County Kerry');
  });

  it('keeps the curated places and their slugs, and adds what OSM knows around them', () => {
    const { places, dropped } = buildIndex({
      counties: [countyShape(countyFeature('County Cork', 51.9, -8.5))!],
      candidates: [
        classify(node({ place: 'town', name: 'Kinsale', population: '5991' }, 51.7059, -8.5222))!,
        // An OSM copy of a curated town: dropped.
        classify(node({ place: 'city', name: 'Cork' }, 51.8985, -8.4756))!,
        classify(
          road('Pearse Street', [
            [51.7062, -8.5226],
            [51.7065, -8.5216],
          ]),
        )!,
        // Outside every county loaded: dropped.
        classify(node({ place: 'town', name: 'Faraway' }, 54.9, -7.0))!,
      ],
    });
    const slugs = places.map((p) => p.place.slug);
    expect(slugs).toContain('cork-city');
    expect(slugs).toContain('rathmines');
    expect(slugs).toContain('kinsale');
    const street = places.find((p) => p.place.kind === 'street')!.place;
    expect(street).toMatchObject({
      name: 'Pearse Street',
      county: 'Cork',
      context: 'Kinsale, County Cork',
    });
    expect(street.slug).toBe('pearse-street-kinsale-county-cork');
    expect(dropped).toEqual({ outsideRepublic: 1, duplicates: 1 });
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
