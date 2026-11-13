import { formatEuro } from '@/lib/format';

/**
 * The words renters see when they search and look at a home (M59 to M74). Plain, warm and
 * short, and every page says what happens next.
 */

/** "12 homes", "1 home", "No homes". */
export function homesCount(n: number): string {
  if (n === 0) return 'No homes';
  return n === 1 ? '1 home' : `${n.toLocaleString('en-IE')} homes`;
}

/**
 * M67: the whole cost to move in, before anyone enquires. "€5,000 to move in: first month’s
 * rent of €2,500 and a deposit of €2,500. No other fees."
 */
export function moveInCostWords(rentCents: number, depositCents: number): string {
  const total = formatEuro(rentCents + depositCents);
  if (depositCents === 0) {
    return `${total} to move in: the first month’s rent. No deposit and no other fees.`;
  }
  return `${total} to move in: first month’s rent of ${formatEuro(rentCents)} and a deposit of ${formatEuro(depositCents)}. No other fees.`;
}

export const PETS_CONSIDERED = 'Pets considered';
export const NO_PETS = 'No pets';
export const ASSISTANCE_DOGS = 'Assistance dogs are always welcome.';

export const sortWords = {
  best: 'Best match',
  newest: 'Newest',
  cheapest: 'Rent: lowest first',
  dearest: 'Rent: highest first',
} as const;

/** M69: what happens after a renter enquires, in order. */
export function whatHappensWhenYouEnquire(input: {
  letterName: string;
  nextViewing: string | null;
  enquiriesClose: string | null;
}): string[] {
  return [
    `You’ll get a reply within minutes from ${input.letterName}’s AI assistant. It answers from the facts about this home, and you can ask for a person at any time.`,
    `${input.letterName} decides who views, and who is offered the home. Gaff never decides.`,
    input.nextViewing
      ? `The next viewings are on ${input.nextViewing}. If you’re invited, you choose a time that suits you.`
      : `${input.letterName} sets the viewing times. If you’re invited, you choose a time that suits you.`,
    input.enquiriesClose
      ? `Enquiries close on ${input.enquiriesClose}.`
      : `Enquiries stay open until ${input.letterName} has enough people to view.`,
    'Everyone who enquires hears back, either way.',
    'Nobody will ask you for money before you sign a tenancy agreement. If anyone does, don’t send any, and tell Gaff.',
  ];
}

/** M61: what a wider search changes, in words. */
export function wideningWords(
  widening:
    | { change: 'distance'; phrase: string }
    | { change: 'area'; areaName: string }
    | { change: 'budget'; maxRent: number }
    | { change: 'date'; date: string }
    | { change: 'beds'; beds: number }
    | { change: 'drop'; filter: string },
): string {
  switch (widening.change) {
    case 'distance':
      return `Look ${widening.phrase}`;
    case 'area':
      return `Look in ${widening.areaName}`;
    case 'budget':
      return `Raise your budget to ${formatEuro(widening.maxRent * 100)} a month`;
    case 'date':
      return `Move in by ${widening.date}`;
    case 'beds':
      return widening.beds === 0
        ? 'Include studios'
        : `${widening.beds} or more bedroom${widening.beds === 1 ? '' : 's'}`;
    case 'drop':
      return `Without “${filterNames[widening.filter] ?? widening.filter}”`;
  }
}

export const filterNames: Record<string, string> = {
  minRent: 'minimum rent',
  baths: 'bathrooms',
  types: 'type of home',
  furnishing: 'furnishing',
  pets: 'pets considered',
  parking: 'parking',
  outdoor: 'outdoor space',
  access: 'accessibility',
  minBer: 'energy rating',
  listedWithin: 'newly listed',
};

/** M74: what a renter sees on the page of a home that's gone. */
export const closedWords = {
  let: 'This home has been let',
  withdrawn: 'This home is no longer available',
  similar: 'Similar homes nearby that are taking enquiries',
} as const;

/** M59: how Gaff orders results, in plain words. */
export const howResultsAreOrdered = [
  'Gaff shows homes in “Best match” order unless you choose another. Best match is the same for everyone, and no letter can pay to change it.',
  'Three things decide it, in this order of weight:',
] as const;

/**
 * M56: the line under a suggestion, so "Blackrock" and "Blackrock, Cork" can be told apart:
 * "Town in County Cork", "Rathgar, Dublin 6". Places from the index carry their own context;
 * otherwise it comes from the kind.
 */
export function placeDescription(place: {
  kind: string;
  county: string;
  context?: string | null;
}): string {
  if (place.context) return place.context;
  const inCounty = place.county === 'Dublin' ? 'County Dublin' : `County ${place.county}`;
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
    case 'area':
      return place.county === 'Dublin' ? 'Area in Dublin' : `Area in ${inCounty}`;
    case 'townland':
      return `Townland in ${inCounty}`;
    case 'street':
      return `Street in ${inCounty}`;
    default:
      return inCounty;
  }
}
