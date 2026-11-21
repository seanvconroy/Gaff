import { describeStay, NO_PETS_DETAIL } from '@/domain/criteria/criteria';
import { furnishing } from '@/domain/lettings/new-letting';
import type { FilterKey, SearchFilters, SearchType, Stay } from '@/domain/search/filters';
import type { Miss } from '@/domain/search/match';
import { normalise } from '@/domain/places/normalise';
import { formatDate, formatEuro, formatRent } from '@/lib/format';

/**
 * The words of the public site's first screen and of search (UX-SR-1 to UX-SR-9). Plain, warm
 * Irish English. Nothing here hurries anyone or describes who a home would suit (rule 3).
 */
export const searchCopy = {
  title: 'Search',
  question: 'What are you looking for?',
  /** UX-SR-14: the box takes a place, a road or a sentence, and says so. */
  placeholder: 'Area, road or describe it',
  search: 'Search',
  bar: {
    tip: 'Type an area, a road or an Eircode. Or say what you want, like “2-bed near Highfield Road under €2,000, no pets”.',
    searchFor: 'Search for',
    didYouMean: 'Did you mean',
    found: (count: number) => (count === 1 ? '1 suggestion' : `${count} suggestions`),
    notFound: (typed: string) =>
      `We couldn’t find ‘${typed}’. Try a town, a road, a Dublin district or a county.`,
    clear: 'Clear the search box',
  },
  filters: 'Filters',
  understood: 'What Gaff understood',
  /** States table: the words weren't understood. */
  unclear: 'Gaff didn’t understand that. Try an area or a road, like Ranelagh or Highfield Road.',
  /** M59: the link to how results are ordered, beside the results' heading. */
  order: 'How results are ordered',
  homesNow: 'Homes on Gaff now',
  close: 'Close to what you asked',
  /** UX-SR-15: no home is where they searched: the nearest that fit the rest. */
  nearest: 'The nearest homes',
  /** UX-SR-9. */
  empty: {
    title: 'No homes match yet.',
    text: 'Gaff is new, and homes are added every week.',
    action: 'Tell me when one comes up',
  },
  /** UX-SR-2: no home is live on Gaff at all. */
  noHomes: {
    title: 'No homes on Gaff yet.',
    text: 'Homes are added every week.',
  },
  loading: 'Finding homes',
  sheet: {
    show: 'Show homes',
    clear: 'Clear all',
    remove: 'Remove',
  },
  labels: {
    where: 'Where',
    within: 'Within',
    box: 'Map area',
    shapes: 'Drawn area',
    beds: 'Bedrooms',
    maxRent: 'Most rent a month',
    moveIn: 'Move-in date',
    stay: 'How long',
    people: 'People',
    pets: 'Do you have a pet?',
    type: 'Type of home',
    furnished: 'Furnished',
    parking: 'Parking',
  } satisfies Record<FilterKey, string>,
  /** Furnished and parking, asked together. */
  homeFacts: 'The home',
  whereNotFound: 'Gaff doesn’t know that place yet. Try a town, a Dublin district or a county.',
  /** M56, M121: the place search under "Where". */
  where: {
    groups: {
      places: 'Places',
      streets: 'Streets',
      landmarks: 'Landmarks',
      recent: 'Searched this visit',
      popular: 'Places with homes',
    },
    /** Nothing matched what was typed: "We couldn’t find ‘Kinsael’". */
    notFound: (typed: string) => `We couldn’t find ‘${typed}’.`,
    didYouMean: 'Did you mean',
    /** M56: the credit the index's licence asks for, under the suggestions. */
    credit: 'Places from OpenStreetMap',
    found: (count: number) => (count === 1 ? '1 place found' : `${count} places found`),
  },
  /** States table: the words were nearly a place's name. */
  didYouMean: (place: string) => `Did you mean ${place}?`,
  peopleAny: 'Any',
  stays: {
    under_year: 'Under a year',
    year: 'A year',
    longer: 'Longer',
  } satisfies Record<Stay, string>,
  types: {
    apartment: 'Apartment',
    house: 'House',
    duplex: 'Duplex',
    studio: 'Studio',
  } satisfies Record<SearchType, string>,
  bedOptions: [
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4 or more' },
  ],
  yesNo: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ],
} as const;

/** M113: "Within 500 m", "Within 2 km". */
export function withinWords(km: number): string {
  return km < 1 ? `Within ${Math.round(km * 1000)} m` : `Within ${km} km`;
}

/** M113, M57: the words of "Within" and of a map area, in the Filters sheet. */
export const distanceCopy = {
  /** A map area's sheet: there is nothing to set, only to remove. */
  box: 'Homes in the part of the map you’re looking at. Move the map to change it, or remove it to search everywhere.',
  /** UX-SR-13: a drawn area's sheet, the same. */
  shapes:
    'Homes inside what you drew on the map. Drag a corner on the map to reshape it, or remove it to search everywhere.',
} as const;

/** UX-SR-13: "Drawn area near Rathgar", "2 drawn areas near Rathgar". */
export function drawnAreaName(count: number, near: string | null): string {
  const areas = count === 1 ? 'Drawn area' : `${count} drawn areas`;
  return near ? `${areas} near ${near}` : areas;
}

/** UX-SR-15: "600 m away", "1.4 km away", "12 km away". */
export function awayWords(metres: number): string {
  if (metres < 950) return `${Math.max(50, Math.round(metres / 50) * 50)} m away`;
  const km = metres / 1000;
  return `${km < 10 ? Number(km.toFixed(1)) : Math.round(km)} km away`;
}

/** M121: "4 homes". */
export function homesCount(n: number): string {
  if (n === 0) return 'No homes';
  return n === 1 ? '1 home' : `${n.toLocaleString('en-IE')} homes`;
}

/**
 * M56: under a suggestion's name, where it is or what it is: "Rathgar, Dublin 6", "Town in
 * County Cork", "Eircode area · Kinsale".
 */
export function placeDescription(place: {
  kind: string;
  county: string;
  context?: string | null;
}): string {
  if (place.context) return place.context;
  const inCounty = `County ${place.county}`;
  switch (place.kind) {
    case 'county':
      return 'County';
    case 'city':
      return `City in ${inCounty}`;
    case 'town':
      return `Town in ${inCounty}`;
    case 'village':
      return `Village in ${inCounty}`;
    case 'district':
      return 'Dublin postal district';
    case 'townland':
      return `Townland in ${inCounty}`;
    default:
      return inCounty;
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "3 homes fit what you asked". */
export function fitHeading(count: number): string {
  return `${plural(count, 'home fits', 'homes fit')} what you asked`;
}

const bedWords = (beds: number) =>
  beds >= 4 ? '4 or more bedrooms' : plural(beds, 'bedroom', 'bedrooms');

/**
 * UX-SR-3: each chip says what Gaff understood, as the PRD writes it. `placeName` is the
 * search's place as the index names it ("Ranelagh, Dublin 6"), from the server
 * (src/server/places): the search itself holds only the place's slug.
 */
export function chipLabel(
  key: FilterKey,
  filters: SearchFilters,
  now = new Date(),
  placeName = '',
): string {
  switch (key) {
    case 'where':
      return placeName;
    case 'within':
      return withinWords(filters.within ?? 1);
    case 'box':
      return searchCopy.labels.box;
    case 'shapes':
      return placeName || drawnAreaName(filters.shapes?.length ?? 1, null);
    case 'beds':
      return bedWords(filters.beds ?? 1);
    case 'maxRent':
      return `Up to ${formatRent((filters.maxRent ?? 0) * 100)}`;
    case 'moveIn':
      return `From ${formatDate(filters.moveIn ?? '', now)}`;
    case 'stay':
      return filters.stay === 'longer' ? 'Longer than a year' : searchCopy.stays[filters.stay!];
    case 'people':
      return plural(filters.people ?? 1, 'person', 'people');
    case 'pets':
      return filters.pets ? 'With a pet' : 'No pets';
    case 'type':
      return searchCopy.types[filters.type!];
    case 'furnished':
      return 'Furnished';
    case 'parking':
      return 'Parking';
  }
}

const typeWords: Record<string, string> = {
  apartment: 'apartment',
  house: 'house',
  duplex: 'duplex',
  studio: 'studio',
};

/** Where a home is, as a card says it: "Ranelagh, Dublin 6", "Bray, Co. Wicklow". */
function whereWords(home: { area: string; county: string }): string {
  if (` ${normalise(home.area)} `.includes(` ${normalise(home.county)} `)) return home.area;
  return `${home.area}, ${home.county === 'Dublin' ? 'Dublin' : `Co. ${home.county}`}`;
}

/** UX-SR-6: a card's one line: "2-bed apartment · Ranelagh, Dublin 6". */
export function cardLine(home: {
  bedrooms: number;
  propertyType: string;
  area: string;
  county: string;
}): string {
  const kind =
    home.propertyType === 'studio' || home.bedrooms === 0
      ? 'Studio'
      : `${home.bedrooms}-bed ${typeWords[home.propertyType] ?? 'home'}`;
  return `${kind} · ${whereWords(home)}`;
}

/** UX-SR-6: the date a home is free, in words. */
export function freeFrom(availableFrom: string, today: string, now = new Date()): string {
  return availableFrom <= today ? 'Free now' : `Free from ${formatDate(availableFrom, now)}`;
}

const stayAsked: Record<Stay, string> = {
  under_year: 'under a year',
  year: 'a year',
  longer: 'longer than a year',
};

function stayOffered(months: number): string {
  const stay = describeStay(months);
  return `${stay.charAt(0).toUpperCase()}${stay.slice(1)} or longer`;
}

const aType: Record<string, string> = {
  apartment: 'An apartment',
  house: 'A house',
  duplex: 'A duplex',
  studio: 'A studio',
};

/**
 * UX-SR-7: the one point a close home misses, in words: what the home offers, then what was
 * asked. "Up to 2 people. You asked for 3."
 */
export function missWords(miss: Miss, now = new Date()): string {
  switch (miss.point) {
    case 'maxRent':
      return `${formatRent(miss.rentCents)}. You asked for up to ${formatEuro(miss.asked * 100)}.`;
    case 'beds':
      return `${miss.bedrooms === 0 ? 'A studio' : plural(miss.bedrooms, 'bedroom', 'bedrooms')}. You asked for ${miss.asked >= 4 ? '4 or more' : miss.asked}.`;
    case 'moveIn':
      return `Free from ${formatDate(miss.availableFrom, now)}. You asked for ${formatDate(miss.asked, now)}.`;
    case 'moveInBy':
      return `Move in by ${formatDate(miss.moveInBy, now)}. You asked for ${formatDate(miss.asked, now)}.`;
    case 'stay':
      return `${stayOffered(miss.minStayMonths)}. You asked for ${stayAsked[miss.asked]}.`;
    case 'people':
      return `Up to ${plural(miss.maxOccupants, 'person', 'people')}. You asked for ${miss.asked}.`;
    case 'pets':
      return `${NO_PETS_DETAIL}. You said you have a pet.`;
    case 'furnished':
      return `${miss.furnished ? (furnishing[miss.furnished as keyof typeof furnishing] ?? 'Not furnished') : 'Furnishing not given'}. You asked for furnished.`;
    case 'parking':
      return `${miss.parking === 'none' ? 'No parking' : 'Parking not given'}. You asked for parking.`;
    case 'type':
      return `${aType[miss.propertyType] ?? 'Another kind of home'}. You asked for ${(aType[miss.asked] ?? '').toLowerCase()}.`;
  }
}

/** The heart's name for a screen reader: "Save 2-bed apartment · Ranelagh, Dublin 6". */
export const saveLabel = (line: string) => `Save ${line}`;
