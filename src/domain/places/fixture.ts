import { fromRow, curatedPlaces, type TownRow } from './curated';
import { gazetteer, type Gazetteer, type Place } from './gazetteer';

/**
 * A small, fixed set of real Irish places for tests, end-to-end checks and development without
 * the full place index (M56): the curated base, plus the names search has to handle: Kinsale,
 * Kinsealy, the Highfield streets, Kinsale Road, a few landmarks and a townland, and the towns
 * the journeys use. Centres are approximate.
 */

export { curatedPlaces };

/** The redesign's examples: places beyond the first list, streets, landmarks and a townland. */
const more: Place[] = [
  // Towns the search journeys and tests use, as the index has them.
  ...(
    [
      ['Westport', 'Mayo', 53.8001, -9.5218, 2000],
      ['Clifden', 'Galway', 53.4894, -10.0195, 1500],
      ['Rush', 'Dublin', 53.522, -6.0909, 2000],
      ['Shannon', 'Clare', 52.7038, -8.8644, 2500],
      ['Dingle / Daingean Uí Chúis', 'Kerry', 52.1408, -10.2689, 1500, 'dingle-daingean-ui-chuis'],
    ] satisfies TownRow[]
  ).map(fromRow('town')),
  {
    slug: 'ballinlough-2',
    name: 'Ballinlough',
    kind: 'area',
    county: 'Cork',
    context: 'Area in Cork city',
    centre: { lat: 51.8892, lng: -8.4447 },
    radiusMetres: 800,
  },
  {
    slug: 'kinsale',
    name: 'Kinsale',
    irishName: 'Cionn tSáile',
    kind: 'town',
    county: 'Cork',
    centre: { lat: 51.7059, lng: -8.5222 },
    radiusMetres: 2000,
    population: 5991,
  },
  {
    slug: 'kinsealy',
    name: 'Kinsealy',
    kind: 'village',
    county: 'Dublin',
    centre: { lat: 53.4253, lng: -6.1737 },
    radiusMetres: 1200,
  },
  {
    slug: 'highfield-cork',
    name: 'Highfield',
    kind: 'area',
    county: 'Cork',
    context: 'Area in Cork city',
    centre: { lat: 51.8892, lng: -8.5052 },
    radiusMetres: 700,
  },
  {
    slug: 'kinsalebeg',
    name: 'Kinsalebeg',
    kind: 'townland',
    county: 'Waterford',
    context: 'Townland near Youghal, County Waterford',
    centre: { lat: 51.9601, lng: -7.8402 },
    radiusMetres: 1000,
  },
  {
    slug: 'highfield-road-rathgar-dublin-6',
    name: 'Highfield Road',
    kind: 'street',
    county: 'Dublin',
    context: 'Rathgar, Dublin 6',
    routingKey: 'D06',
    centre: { lat: 53.3156, lng: -6.2672 },
    line: [
      [
        { lat: 53.3149, lng: -6.2727 },
        { lat: 53.3157, lng: -6.2672 },
        { lat: 53.3166, lng: -6.2618 },
      ],
    ],
    radiusMetres: 300,
  },
  {
    slug: 'highfield-road-ballintemple-cork',
    name: 'Highfield Road',
    kind: 'street',
    county: 'Cork',
    context: 'Ballintemple, Cork',
    centre: { lat: 51.8935, lng: -8.429 },
    line: [
      [
        { lat: 51.8929, lng: -8.4312 },
        { lat: 51.8941, lng: -8.4268 },
      ],
    ],
    radiusMetres: 200,
  },
  {
    slug: 'highfield-park-dundrum-dublin-14',
    name: 'Highfield Park',
    kind: 'street',
    county: 'Dublin',
    context: 'Dundrum, Dublin 14',
    routingKey: 'D14',
    centre: { lat: 53.2965, lng: -6.2526 },
    radiusMetres: 200,
  },
  {
    slug: 'kinsale-road-ballyphehane-cork',
    name: 'Kinsale Road',
    kind: 'street',
    county: 'Cork',
    context: 'Ballyphehane, Cork',
    centre: { lat: 51.8848, lng: -8.4635 },
    radiusMetres: 800,
  },
  {
    slug: 'highfield-hospital-whitehall-dublin-9',
    name: 'Highfield Hospital',
    kind: 'landmark',
    landmarkKind: 'hospital',
    county: 'Dublin',
    context: 'Whitehall, Dublin 9',
    routingKey: 'D09',
    centre: { lat: 53.3786, lng: -6.256 },
    radiusMetres: 150,
  },
  {
    slug: 'st-vincents-university-hospital-elm-park-dublin-4',
    name: "St Vincent's University Hospital",
    kind: 'landmark',
    landmarkKind: 'hospital',
    county: 'Dublin',
    context: 'Elm Park, Dublin 4',
    routingKey: 'D04',
    centre: { lat: 53.3176, lng: -6.2125 },
    radiusMetres: 200,
    aliases: ['SVUH', "St Vincent's Hospital"],
  },
  {
    slug: 'university-college-dublin-belfield-dublin-4',
    name: 'University College Dublin',
    kind: 'landmark',
    landmarkKind: 'college',
    county: 'Dublin',
    context: 'Belfield, Dublin 4',
    routingKey: 'D04',
    centre: { lat: 53.3065, lng: -6.2216 },
    radiusMetres: 600,
    aliases: ['UCD', 'Belfield'],
  },
  {
    slug: 'trinity-college-dublin-dublin-2',
    name: 'Trinity College Dublin',
    kind: 'landmark',
    landmarkKind: 'college',
    county: 'Dublin',
    context: 'Dublin 2',
    routingKey: 'D02',
    centre: { lat: 53.3438, lng: -6.2546 },
    radiusMetres: 300,
    aliases: ['TCD', 'Trinity College'],
  },
  {
    slug: 'heuston-station-dublin-8',
    name: 'Heuston Station',
    kind: 'landmark',
    landmarkKind: 'station',
    county: 'Dublin',
    context: 'Dublin 8',
    routingKey: 'D08',
    centre: { lat: 53.3464, lng: -6.2939 },
    radiusMetres: 150,
  },
];

export const fixturePlaces: readonly Place[] = [...curatedPlaces, ...more];

/** The fixture as a gazetteer: every place, streets and landmarks included. */
export function fixtureGazetteer(): Gazetteer {
  return gazetteer(fixturePlaces);
}
