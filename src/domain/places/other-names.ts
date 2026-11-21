import type { County, Place } from './gazetteer';
import { normalise } from './normalise';

/**
 * Q60 (ADR-0018): the other names the best-known colleges, hospitals, stations and parks go by:
 * acronyms ("UCD", "UHL") and everyday names ("The Mater", "Kent Station") that OpenStreetMap
 * doesn't hold. The list is Gaff's own and trusted, like the curated base.
 *
 * Each row's names are added to the aliases of the landmark of that name in that county as it
 * is loaded (`rowFromPlace`), so the place search finds it by them and ranks it as a place that
 * goes by that name (`matchQuality`). A change here takes effect at the next load, without a
 * rebuild.
 *
 * Keep it short, and to names renters type. The first column is the landmark's name as the
 * index holds it: `pnpm places:check` and load.test.ts fail when a row no longer finds its
 * landmark, as when OpenStreetMap renames one.
 */

// [the landmark's name in the index, its county, the other names it goes by]
type Row = [string, County, string[]];

const rows: Row[] = [
  // Colleges
  ['University College Dublin (Belfield Campus)', 'Dublin', ['UCD', 'UCD Belfield']],
  ['Trinity College Dublin', 'Dublin', ['TCD', 'Trinity', 'Trinity College']],
  ['Dublin City University Glasnevin Campus', 'Dublin', ['DCU', 'DCU Glasnevin']],
  [
    'Technological University Dublin - Grangegorman Campus',
    'Dublin',
    ['TU Dublin', 'TUD', 'TU Dublin Grangegorman', 'DIT'],
  ],
  ['Technological University Dublin - Bolton Street Campus', 'Dublin', ['TU Dublin Bolton Street']],
  [
    'Technological University Dublin, Aungier Street Campus',
    'Dublin',
    ['TU Dublin Aungier Street'],
  ],
  ['TU Dublin Tallaght', 'Dublin', ['TUD Tallaght', 'IT Tallaght']],
  ['TU Dublin Blanchardstown', 'Dublin', ['TUD Blanchardstown', 'IT Blanchardstown']],
  ['Royal College of Surgeons in Ireland', 'Dublin', ['RCSI', 'College of Surgeons']],
  ['National College of Ireland - Campus 1', 'Dublin', ['NCI', 'National College of Ireland']],
  ['Maynooth University North Campus', 'Kildare', ['MU', 'NUI Maynooth', 'NUIM']],
  ['Maynooth University South Campus', 'Kildare', ['MU', 'NUI Maynooth', 'NUIM']],
  ['University College Cork Main Campus', 'Cork', ['UCC']],
  [
    'MTU Bishopstown Campus',
    'Cork',
    ['MTU', 'MTU Cork', 'Munster Technological University', 'CIT', 'Cork Institute of Technology'],
  ],
  [
    'Ollscoil na Gaillimhe - University of Galway',
    'Galway',
    ['University of Galway', 'NUIG', 'NUI Galway', 'UCG'],
  ],
  ['Atlantic Technological University Galway', 'Galway', ['ATU', 'ATU Galway']],
  ['Atlantic Technological University Sligo', 'Sligo', ['ATU Sligo', 'IT Sligo']],
  ['Atlantic Technological University Donegal Letterkenny', 'Donegal', ['LYIT']],
  ['University of Limerick', 'Limerick', ['UL']],
  ['Mary Immaculate College', 'Limerick', ['MIC', 'Mary I']],
  [
    'Technological University of the Shannon: Midlands Midwest',
    'Limerick',
    ['TUS', 'TUS Limerick', 'LIT', 'Limerick Institute of Technology'],
  ],
  [
    'Technological University of the Shannon: Midlands Midwest',
    'Westmeath',
    ['TUS', 'TUS Athlone', 'AIT', 'Athlone Institute of Technology'],
  ],
  [
    'South East Technological University - Cork Road Campus',
    'Waterford',
    ['SETU', 'SETU Waterford', 'WIT', 'Waterford Institute of Technology'],
  ],
  [
    'South East Technological University - Kilkenny Road Campus',
    'Carlow',
    ['SETU Carlow', 'IT Carlow'],
  ],
  ['Dundalk Institute of Technology - DKIT', 'Louth', ['DkIT', 'Dundalk Institute of Technology']],

  // Hospitals
  ['Mater Misericordiae University Hospital', 'Dublin', ['The Mater', 'Mater', 'Mater Hospital']],
  [
    "St Vincent's University Hospital",
    'Dublin',
    ["St Vincent's", "St Vincent's Hospital", "Vincent's", 'SVUH'],
  ],
  ["St. James's Hospital", 'Dublin', ["St James's", 'St James Hospital']],
  ['Tallaght University Hospital', 'Dublin', ['Tallaght Hospital', 'TUH']],
  [
    "Children's Health Ireland at Crumlin",
    'Dublin',
    ['Crumlin Hospital', "Crumlin Children's Hospital", 'CHI Crumlin'],
  ],
  [
    "Children's Health Ireland at Temple Street",
    'Dublin',
    ['Temple Street Hospital', "Temple Street Children's Hospital", 'CHI Temple Street'],
  ],
  ['Rotunda Hospital', 'Dublin', ['Rotunda']],
  ['Coombe Women & Infants University Hospital', 'Dublin', ['Coombe Hospital']],
  ['The National Maternity Hospital', 'Dublin', ['National Maternity Hospital', 'NMH']],
  ['Royal Victoria Eye and Ear Hospital', 'Dublin', ['Eye and Ear', 'Eye and Ear Hospital']],
  ['Mercy University Hospital', 'Cork', ['The Mercy', 'Mercy Hospital', 'MUH']],
  ['University Hospital Galway', 'Galway', ['UHG', 'UCHG', 'Galway University Hospital']],
  [
    'University Hospital Limerick',
    'Limerick',
    ['UHL', 'Limerick University Hospital', 'Limerick Regional Hospital'],
  ],
  ['University Hospital Waterford', 'Waterford', ['UHW', 'Waterford University Hospital']],
  ['University Hospital Kerry', 'Kerry', ['UHK', 'Kerry University Hospital']],
  ['Letterkenny University Hospital', 'Donegal', ['LUH', 'Letterkenny General Hospital']],
  [
    'Our Lady of Lourdes Hospital',
    'Louth',
    ['Drogheda Hospital', 'The Lourdes', 'Lourdes Hospital'],
  ],

  // Stations
  ['Dublin Heuston', 'Dublin', ['Heuston Station']],
  ['Dublin Connolly', 'Dublin', ['Connolly Station']],
  ['Dublin Pearse', 'Dublin', ['Pearse Station']],
  ['Tara Street', 'Dublin', ['Tara Street Station']],
  ['Busáras', 'Dublin', ['Central Bus Station', 'Dublin Bus Station']],
  ['Cork Kent', 'Cork', ['Kent Station', 'Cork Train Station']],
  [
    'Limerick Colbert',
    'Limerick',
    ['Colbert Station', 'Limerick Station', 'Limerick Train Station'],
  ],
  ['Galway Ceannt', 'Galway', ['Ceannt Station', 'Galway Station', 'Galway Train Station']],
  [
    'Waterford Plunkett',
    'Waterford',
    ['Plunkett Station', 'Waterford Station', 'Waterford Train Station'],
  ],
  ['Kilkenny MacDonagh', 'Kilkenny', ['MacDonagh Station', 'Kilkenny Station']],
  ['Sligo Mac Diarmada', 'Sligo', ['Mac Diarmada Station', 'Sligo Station', 'Sligo Train Station']],
  ['Tralee Casement', 'Kerry', ['Casement Station', 'Tralee Station', 'Tralee Train Station']],

  // Parks
  ['Phoenix Park', 'Dublin', ['The Phoenix Park']],
  ["St Anne's Park", 'Dublin', ["Saint Anne's Park", "St Anne's"]],
];

const keyOf = (name: string, county: string) => `${normalise(name)}|${county}`;

/** A landmark the list names: its name as the index holds it, its county, its other names. */
export interface OtherNames {
  name: string;
  county: County;
  names: string[];
}

export const otherNames: readonly OtherNames[] = rows.map(([name, county, names]) => ({
  name,
  county,
  names,
}));

const byKey = new Map(otherNames.map((entry) => [keyOf(entry.name, entry.county), entry.names]));

/** The other names this place goes by, from the list: empty for nearly every place. */
export function otherNamesOf(place: Pick<Place, 'kind' | 'name' | 'county'>): readonly string[] {
  if (place.kind !== 'landmark') return [];
  return byKey.get(keyOf(place.name, place.county)) ?? [];
}

/**
 * The place with its other names among its aliases, after the ones it has: each once, however
 * it is written ("DCU" isn't added to a campus OpenStreetMap already calls that).
 */
export function withOtherNames(place: Place): Place {
  const held = new Set([place.name, ...(place.aliases ?? [])].map(normalise));
  const added: string[] = [];
  for (const name of otherNamesOf(place)) {
    if (held.has(normalise(name))) continue;
    held.add(normalise(name));
    added.push(name);
  }
  return added.length ? { ...place, aliases: [...(place.aliases ?? []), ...added] } : place;
}

/** The list's rows that name no landmark among these places: a renamed or missing landmark. */
export function otherNamesWithoutPlace(places: Iterable<Place>): OtherNames[] {
  const found = new Set<string>();
  for (const place of places) {
    if (place.kind === 'landmark') found.add(keyOf(place.name, place.county));
  }
  return otherNames.filter((entry) => !found.has(keyOf(entry.name, entry.county)));
}
