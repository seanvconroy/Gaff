import type { County } from './gazetteer';

/**
 * M56 (ADR-0027): each county's population at Census 2022 (CSO, summary results). Cork, Dublin,
 * Galway, Limerick and Waterford include their cities; together they make the State's 5,149,139.
 *
 * Suggestions that are otherwise equal, such as the many streets called "Highfield Road" or
 * "Main Street", come in order of their county's size, because more people live and rent in the
 * bigger ones. OpenStreetMap's population tags are too sparse for this, and how many streets it
 * maps in a county says more about its mappers than its people.
 */
export const COUNTY_POPULATION: Readonly<Record<County, number>> = {
  Carlow: 61_968,
  Cavan: 81_704,
  Clare: 127_938,
  Cork: 584_156,
  Donegal: 167_084,
  Dublin: 1_458_154,
  Galway: 277_737,
  Kerry: 156_458,
  Kildare: 247_774,
  Kilkenny: 104_160,
  Laois: 91_877,
  Leitrim: 35_199,
  Limerick: 209_536,
  Longford: 46_751,
  Louth: 139_703,
  Mayo: 137_970,
  Meath: 220_826,
  Monaghan: 65_288,
  Offaly: 83_150,
  Roscommon: 70_259,
  Sligo: 70_198,
  Tipperary: 167_895,
  Waterford: 127_363,
  Westmeath: 96_221,
  Wexford: 163_919,
  Wicklow: 155_851,
};
