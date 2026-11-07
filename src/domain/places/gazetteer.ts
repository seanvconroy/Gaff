import { counties } from '@/domain/lettings/new-letting';
import { dublinDistricts } from './eircode';
import type { Point } from './geo';
import { slugify } from './slug';

/**
 * M56, M62: the places renters search by. Counties match on the home's county, Dublin
 * districts on its routing key, and towns and areas on distance from their centre.
 *
 * Centres are approximate, for the first version: the places refresh (tech spec, milestone 4)
 * replaces them with boundaries from Tailte Éireann and OpenStreetMap open data.
 */

export type County = (typeof counties)[number];
export type PlaceKind = 'county' | 'town' | 'district' | 'area';

export interface Place {
  slug: string;
  name: string;
  kind: PlaceKind;
  county: County;
  centre: Point;
  radiusMetres: number;
  routingKey?: string;
  aliases?: string[];
}

const countyCentres: Record<County, [number, number]> = {
  Carlow: [52.72, -6.84],
  Cavan: [53.99, -7.36],
  Clare: [52.87, -8.98],
  Cork: [51.95, -8.7],
  Donegal: [54.92, -7.95],
  Dublin: [53.35, -6.26],
  Galway: [53.35, -8.85],
  Kerry: [52.15, -9.55],
  Kildare: [53.2, -6.8],
  Kilkenny: [52.58, -7.2],
  Laois: [52.98, -7.36],
  Leitrim: [54.12, -8.0],
  Limerick: [52.5, -8.75],
  Longford: [53.73, -7.79],
  Louth: [53.92, -6.48],
  Mayo: [53.9, -9.3],
  Meath: [53.61, -6.66],
  Monaghan: [54.14, -6.97],
  Offaly: [53.24, -7.71],
  Roscommon: [53.75, -8.25],
  Sligo: [54.15, -8.6],
  Tipperary: [52.67, -7.82],
  Waterford: [52.2, -7.6],
  Westmeath: [53.53, -7.46],
  Wexford: [52.48, -6.57],
  Wicklow: [52.98, -6.36],
};

const countyAliases: Partial<Record<County, string[]>> = {
  Dublin: ['Baile Átha Cliath', 'County Dublin', 'Co. Dublin'],
  Cork: ['Corcaigh', 'County Cork', 'Co. Cork'],
  Galway: ['Gaillimh', 'County Galway', 'Co. Galway'],
  Limerick: ['Luimneach', 'County Limerick', 'Co. Limerick'],
};

const districtCentres: Record<string, [number, number]> = {
  D01: [53.353, -6.26],
  D02: [53.339, -6.252],
  D03: [53.364, -6.225],
  D04: [53.329, -6.228],
  D05: [53.385, -6.19],
  D06: [53.32, -6.265],
  D6W: [53.315, -6.295],
  D07: [53.357, -6.285],
  D08: [53.338, -6.29],
  D09: [53.38, -6.245],
  D10: [53.34, -6.34],
  D11: [53.39, -6.29],
  D12: [53.32, -6.32],
  D13: [53.395, -6.12],
  D14: [53.295, -6.27],
  D15: [53.385, -6.38],
  D16: [53.275, -6.25],
  D17: [53.4, -6.2],
  D18: [53.265, -6.19],
  D20: [53.355, -6.36],
  D22: [53.32, -6.4],
  D24: [53.285, -6.38],
};

// [name, county, lat, lng, radius in metres, slug if the name alone would clash, aliases]
type TownRow = [string, County, number, number, number, string?, string[]?];

const towns: TownRow[] = [
  ['Cork city', 'Cork', 51.8985, -8.4756, 6000, 'cork-city'],
  ['Galway city', 'Galway', 53.2707, -9.0568, 5000, 'galway-city'],
  ['Limerick city', 'Limerick', 52.6638, -8.6267, 5000, 'limerick-city'],
  ['Waterford city', 'Waterford', 52.2593, -7.1101, 4000, 'waterford-city'],
  ['Kilkenny city', 'Kilkenny', 52.6541, -7.2448, 3000, 'kilkenny-city'],
  ['Athlone', 'Westmeath', 53.4239, -7.9407, 3000],
  ['Drogheda', 'Louth', 53.7179, -6.3561, 3000],
  ['Dundalk', 'Louth', 54.009, -6.4049, 3000],
  ['Bray', 'Wicklow', 53.2009, -6.1111, 3000],
  ['Greystones', 'Wicklow', 53.144, -6.072, 2500],
  ['Navan', 'Meath', 53.6528, -6.6814, 3000],
  ['Naas', 'Kildare', 53.2159, -6.6669, 3000],
  ['Newbridge', 'Kildare', 53.1819, -6.7967, 3000],
  ['Maynooth', 'Kildare', 53.3813, -6.5918, 2500],
  ['Celbridge', 'Kildare', 53.34, -6.539, 2500],
  ['Leixlip', 'Kildare', 53.3659, -6.4956, 2500],
  ['Sligo town', 'Sligo', 54.2766, -8.4761, 3000, 'sligo-town'],
  ['Wexford town', 'Wexford', 52.3369, -6.4633, 3000, 'wexford-town'],
  ['Tralee', 'Kerry', 52.2713, -9.6999, 3000],
  ['Killarney', 'Kerry', 52.0599, -9.5044, 3000],
  ['Ennis', 'Clare', 52.8436, -8.9864, 3000],
  ['Letterkenny', 'Donegal', 54.9558, -7.7342, 3000],
  ['Carlow town', 'Carlow', 52.8408, -6.9261, 3000, 'carlow-town'],
  ['Mullingar', 'Westmeath', 53.526, -7.3381, 3000],
  ['Portlaoise', 'Laois', 53.0344, -7.2998, 3000],
  ['Tullamore', 'Offaly', 53.2739, -7.4889, 3000],
  ['Castlebar', 'Mayo', 53.855, -9.2988, 3000],
  ['Clonmel', 'Tipperary', 52.355, -7.704, 3000],
  ['Balbriggan', 'Dublin', 53.6128, -6.1819, 2500],
  ['Swords', 'Dublin', 53.4597, -6.2181, 3000],
  ['Malahide', 'Dublin', 53.4508, -6.1544, 2500],
];

const dublinAreas: TownRow[] = [
  ['Dublin city centre', 'Dublin', 53.348, -6.26, 1500, undefined, ['City centre']],
  ['Rathmines', 'Dublin', 53.3225, -6.2655, 1200],
  ['Ranelagh', 'Dublin', 53.3262, -6.2563, 1000],
  ['Rathgar', 'Dublin', 53.3138, -6.274, 1000],
  ['Milltown', 'Dublin', 53.3105, -6.251, 1000],
  ['Terenure', 'Dublin', 53.3096, -6.2848, 1000],
  ["Harold's Cross", 'Dublin', 53.327, -6.279, 900, undefined, ['Harolds Cross']],
  ['Portobello', 'Dublin', 53.331, -6.265, 700],
  ['Ballsbridge', 'Dublin', 53.329, -6.2305, 1000],
  ['Sandymount', 'Dublin', 53.332, -6.218, 1000],
  ['Donnybrook', 'Dublin', 53.322, -6.237, 1000],
  ['Ringsend', 'Dublin', 53.341, -6.227, 800],
  ['Grand Canal Dock', 'Dublin', 53.339, -6.238, 800, undefined, ['Docklands']],
  ['The Liberties', 'Dublin', 53.341, -6.279, 900, undefined, ['Liberties']],
  ['Kilmainham', 'Dublin', 53.341, -6.305, 1000],
  ['Inchicore', 'Dublin', 53.339, -6.32, 1000],
  ['Stoneybatter', 'Dublin', 53.352, -6.283, 700],
  ['Smithfield', 'Dublin', 53.349, -6.278, 600],
  ['Phibsborough', 'Dublin', 53.36, -6.273, 900, undefined, ['Phibsboro']],
  ['Cabra', 'Dublin', 53.366, -6.295, 1200],
  ['Drumcondra', 'Dublin', 53.37, -6.255, 1000],
  ['Glasnevin', 'Dublin', 53.373, -6.268, 1200],
  ['Clontarf', 'Dublin', 53.365, -6.205, 1500],
  ['Fairview', 'Dublin', 53.363, -6.237, 800],
  ['Marino', 'Dublin', 53.364, -6.228, 700],
  ['East Wall', 'Dublin', 53.354, -6.233, 700],
  ['Raheny', 'Dublin', 53.38, -6.177, 1200],
  ['Howth', 'Dublin', 53.387, -6.065, 2000],
  ['Sutton', 'Dublin', 53.39, -6.11, 1200],
  ['Santry', 'Dublin', 53.397, -6.247, 1200],
  ['Beaumont', 'Dublin', 53.385, -6.225, 1000],
  ['Finglas', 'Dublin', 53.39, -6.3, 1500],
  ['Castleknock', 'Dublin', 53.373, -6.363, 1500],
  ['Blanchardstown', 'Dublin', 53.388, -6.377, 1500],
  ['Lucan', 'Dublin', 53.357, -6.449, 2000],
  ['Clondalkin', 'Dublin', 53.32, -6.394, 1500],
  ['Tallaght', 'Dublin', 53.288, -6.373, 2000],
  ['Crumlin', 'Dublin', 53.324, -6.31, 1200],
  ['Walkinstown', 'Dublin', 53.319, -6.333, 1000],
  ['Rathfarnham', 'Dublin', 53.299, -6.283, 1500],
  ['Churchtown', 'Dublin', 53.298, -6.255, 900],
  ['Dundrum', 'Dublin', 53.29, -6.245, 1200],
  ['Stillorgan', 'Dublin', 53.289, -6.199, 1200],
  ['Booterstown', 'Dublin', 53.31, -6.195, 800],
  ['Blackrock', 'Dublin', 53.3015, -6.1778, 1000],
  ['Monkstown', 'Dublin', 53.294, -6.153, 900],
  ['Dún Laoghaire', 'Dublin', 53.294, -6.134, 1200, undefined, ['Dun Laoghaire', 'Dunleary']],
  ['Dalkey', 'Dublin', 53.277, -6.1, 1000],
  ['Killiney', 'Dublin', 53.26, -6.115, 1500],
  ['Sandyford', 'Dublin', 53.277, -6.22, 1200],
  ['Foxrock', 'Dublin', 53.266, -6.174, 1200],
  ['Chapelizod', 'Dublin', 53.348, -6.341, 800],
  ['Palmerstown', 'Dublin', 53.358, -6.379, 1000],
  ['Whitehall', 'Dublin', 53.383, -6.252, 900],
  ['Artane', 'Dublin', 53.385, -6.205, 1000],
  ['Coolock', 'Dublin', 53.39, -6.2, 1200],
  ['Baldoyle', 'Dublin', 53.399, -6.127, 1000],
  ['Portmarnock', 'Dublin', 53.423, -6.138, 1500],
];

const fromRow =
  (kind: PlaceKind) =>
  ([name, county, lat, lng, radiusMetres, slug, aliases]: TownRow): Place => ({
    slug: slug ?? slugify(name),
    name,
    kind,
    county,
    centre: { lat, lng },
    radiusMetres,
    ...(aliases ? { aliases } : {}),
  });

export const places: readonly Place[] = [
  ...counties.map((county): Place => ({
    slug: slugify(county),
    name: county,
    kind: 'county',
    county,
    centre: { lat: countyCentres[county][0], lng: countyCentres[county][1] },
    radiusMetres: 40_000,
    ...(countyAliases[county] ? { aliases: countyAliases[county] } : {}),
  })),
  ...dublinDistricts.map(({ routingKey, name }): Place => ({
    slug: slugify(name),
    name,
    kind: 'district',
    county: 'Dublin',
    centre: { lat: districtCentres[routingKey]![0], lng: districtCentres[routingKey]![1] },
    radiusMetres: 2500,
    routingKey,
  })),
  ...towns.map(fromRow('town')),
  ...dublinAreas.map(fromRow('area')),
];

export function placeBySlug(slug: string): Place | undefined {
  return places.find((p) => p.slug === slug);
}
