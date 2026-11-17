import {
  MAX_BEDS,
  MAX_PEOPLE,
  searchFiltersSchema,
  type SearchFilters,
  type Stay,
} from './filters';
import { normalise, placeInSentence, searchPlaces } from './places';

/**
 * UX-SR-3, UX-MT-12: a renter's own words, turned into filters. This is plain code, not the
 * model, so search works the same with the reader switched off (UX-AI-12), and it can only ever
 * produce the fields in `searchFiltersSchema`.
 *
 * It looks for what a search can hold and takes nothing else. "Me and my partner" becomes 2
 * people. "I'm a nurse", "we have a baby", "I'm on HAP" become nothing. Instructions inside the
 * words are words like any others: they change nothing. The sentence itself is never kept:
 * the caller turns the result into the search's address and lets the sentence go (UX-SR-11).
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  eighteen: 18,
};
const NUMBER = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
/** A count said with a number: "a" and "an" aren't one here. */
const COUNT = `(\\d{1,2}|${Object.keys(NUMBER_WORDS)
  .filter((word) => word !== 'a' && word !== 'an')
  .join('|')})`;
const toNumber = (word: string): number => NUMBER_WORDS[word] ?? Number(word);

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const SHORT_MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
MONTHS.forEach((month, index) => (SHORT_MONTHS[month] = index + 1));
const MONTH = `(${Object.keys(SHORT_MONTHS).join('|')})`;
/** Words that say a date is a move-in date. "May" counts as a month only after one of them. */
const DATE_CUE = '(?:from|in|starting|start|for|by|on|after|move in|moving in|available)';

export interface ParsedSearch {
  filters: SearchFilters;
  /** Whether anything in the words was understood. */
  understood: boolean;
}

/**
 * Lower case, with the sentence's own marks kept where they carry meaning (€, digits, the dash
 * in "2-bed"), and everything a protected ground might hang on simply not looked at.
 */
function prepare(sentence: string): string {
  return ` ${sentence
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/[,;!?()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function rent(text: string): number | undefined {
  // Thousands commas are already gone: "2,400" is "2400". "2.4k" is 2,400.
  const amount = '(\\d+(?:\\.\\d+)?k?)(?![\\d.k])';
  const euros = (value: string): number =>
    value.endsWith('k') ? Math.round(Number(value.slice(0, -1)) * 1000) : Math.round(Number(value));
  // A range: "€1,800 to €2,400", "1800-2400 euro". The top of it is the most.
  const range = new RegExp(
    `€\\s*${amount}\\s*(?:-|to)\\s*€?\\s*${amount}|${amount}\\s*(?:-|to)\\s*${amount}\\s*(?:euro|eur|€)`,
  ).exec(text);
  if (range) return euros((range[2] ?? range[4])!);
  const cued = new RegExp(
    `(?:under|below|less than|max|maximum|up to|upto|no more than|at most|budget(?: of| is)?|around|about|<)\\s*€?\\s*${amount}(?!\\s*(?:-?\\s*bed|people|person|month|months|year|years|sq|m2))`,
  ).exec(text);
  if (cued) return euros(cued[1]!);
  const marked = new RegExp(
    `€\\s*${amount}|${amount}\\s*(?:euro|eur|€|a month|per month|pm|p\\/m|monthly)\\b`,
  ).exec(text);
  if (marked) return euros((marked[1] ?? marked[2])!);
  return undefined;
}

function bedrooms(text: string): number | undefined {
  const match = new RegExp(
    `\\b${NUMBER}\\s*-?\\s*(?:bed|beds|bedroom|bedrooms|bedroomed|br|bdr|bdrm)\\b`,
  ).exec(text);
  if (!match) return undefined;
  const beds = toNumber(match[1]!);
  return beds >= 1 ? Math.min(beds, MAX_BEDS) : undefined;
}

function people(text: string): number | undefined {
  const counted = new RegExp(
    `\\b${NUMBER}\\s*(?:people|persons|adults|of us|tenants|sharers|housemates|occupants)\\b`,
  ).exec(text);
  if (counted) {
    const count = toNumber(counted[1]!);
    if (count >= 1) return Math.min(count, MAX_PEOPLE);
  }
  // One other person, said as a relationship: only how many, never who (rule 3).
  if (
    /\b(?:me|myself) and (?:my|a) (?:partner|wife|husband|boyfriend|girlfriend|fianc[eé]e?|friend|flatmate|housemate)\b/.test(
      text,
    )
  ) {
    return 2;
  }
  if (/\b(?:just me|only me|on my own|by myself|for myself|for one person)\b/.test(text)) return 1;
  return undefined;
}

function pets(text: string): boolean | undefined {
  // An assistance dog is never a pet (rule 3): it isn't read as one, and isn't kept at all.
  const plain = text.replace(/\b(?:assistance|guide|service|support) dogs?\b/g, ' ');
  if (/\b(?:no pets?|without (?:a )?pets?|pet[- ]free)\b/.test(plain)) return false;
  if (
    /\b(?:pets? (?:friendly|allowed|welcome|ok|okay|considered)|pet[- ]friendly|with (?:a |my |our |two |2 )?(?:small )?(?:pets?|dogs?|cats?)|(?:have|has|got|bringing|own) (?:a |an |my |our |two |2 )?(?:small |little |old )?(?:pets?|dogs?|cats?|rabbits?)|(?:my|our) (?:dogs?|cats?|pets?))\b/.test(
      plain,
    )
  ) {
    return true;
  }
  return undefined;
}

function stay(text: string): Stay | undefined {
  // "My 2 year old" is somebody's age, never a length of stay (rule 3).
  const plain = text.replace(new RegExp(`\\b${NUMBER}[- ](?:year|month)s?[- ]old\\b`, 'g'), ' ');
  if (
    /\b(?:under|less than|shorter than) (?:a|one|1) year\b|\bshort[- ](?:term|let)\b/.test(plain)
  ) {
    return 'under_year';
  }
  if (
    /\b(?:over|more than|longer than) (?:a|one|1) year\b|\b(?:a |one |1 )?years? or (?:longer|more)\b|\blong[- ]?term\b/.test(
      plain,
    )
  ) {
    return 'longer';
  }
  // "A month" is a rent ("€1,800 a month"), never a stay.
  const months = new RegExp(`\\b${COUNT}\\s*(?:months?|mths?)\\b`).exec(plain);
  const years = new RegExp(`\\b${NUMBER}\\s*(?:years?|yrs?)\\b`).exec(plain);
  const total = months ? toNumber(months[1]!) : years ? toNumber(years[1]!) * 12 : null;
  if (total === null || total < 1) return undefined;
  if (total < 12) return 'under_year';
  if (total === 12) return 'year';
  return 'longer';
}

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function realDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The next time a day of a month comes round, from today: "1 January" in November is next year. */
function next(today: string, month: number, day: number, year?: number): string | undefined {
  const [thisYear, thisMonth, thisDay] = today.split('-').map(Number) as [number, number, number];
  let chosen = year ?? thisYear;
  if (year === undefined && (month < thisMonth || (month === thisMonth && day < thisDay))) {
    chosen += 1;
  }
  if (!realDate(chosen, month, day)) return undefined;
  const date = iso(chosen, month, day);
  return date < today ? today : date;
}

function moveIn(text: string, today: string): string | undefined {
  const [thisYear, thisMonth] = today.split('-').map(Number) as [number, number];
  if (
    /\b(?:asap|now|immediately|straight away|right away|as soon as possible|this month)\b/.test(
      text,
    )
  ) {
    return today;
  }
  if (/\bnext month\b/.test(text)) {
    return thisMonth === 12 ? iso(thisYear + 1, 1, 1) : iso(thisYear, thisMonth + 1, 1);
  }
  const yearPart = '(?:\\s+(20\\d{2}))?';
  const dayFirst = new RegExp(
    `(?:${DATE_CUE}\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH}\\b${yearPart}`,
  ).exec(text);
  if (dayFirst) {
    return next(today, SHORT_MONTHS[dayFirst[2]!]!, Number(dayFirst[1]), yearOf(dayFirst[3]));
  }
  const monthFirst = new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b${yearPart}`).exec(
    text,
  );
  if (monthFirst && monthFirst[1] !== 'may') {
    return next(today, SHORT_MONTHS[monthFirst[1]!]!, Number(monthFirst[2]), yearOf(monthFirst[3]));
  }
  const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/.exec(text);
  if (numeric) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : undefined;
    return next(today, Number(numeric[2]), Number(numeric[1]), year);
  }
  // A month alone: from its first day, or from today if it's this month. "May" needs a cue.
  const monthAlone = new RegExp(`(?:\\b${DATE_CUE}\\s+)?\\b${MONTH}\\b${yearPart}`).exec(text);
  if (monthAlone) {
    const word = monthAlone[1]!;
    const cued = new RegExp(`\\b${DATE_CUE}\\s+${word}\\b`).test(text);
    if (word === 'may' && !cued) return undefined;
    const month = SHORT_MONTHS[word]!;
    const year = yearOf(monthAlone[2]);
    if (year === undefined && month === thisMonth) return today;
    return next(today, month, 1, year);
  }
  return undefined;
}

const yearOf = (text: string | undefined): number | undefined => (text ? Number(text) : undefined);

function homeType(text: string): SearchFilters['type'] {
  // A room in a shared house isn't a kind of home a lister offers: it's left out.
  const plain = text.replace(
    /\b(?:house ?share|room in a (?:house|flat|apartment)|flat ?share)\b/g,
    ' ',
  );
  if (/\b(?:studio|bedsit)s?\b/.test(plain)) return 'studio';
  if (/\bduplex(?:es)?\b/.test(plain)) return 'duplex';
  if (/\b(?:apartments?|flats?|apt)\b/.test(plain)) return 'apartment';
  if (
    /\b(?:houses?|bungalow|cottage|townhouse|terraced|semi[- ]detached|semi[- ]d|detached)\b/.test(
      plain,
    )
  ) {
    return 'house';
  }
  return undefined;
}

function furnished(text: string): true | undefined {
  if (/\b(?:part|partly|partially|semi)[- ]?furnished\b/.test(text)) return undefined;
  return /(?<![a-z-])furnished\b/.test(text) ? true : undefined;
}

function parking(text: string): true | undefined {
  if (/\bno (?:car )?parking\b/.test(text)) return undefined;
  return /\b(?:parking|car space|parking space|driveway|garage|off[- ]street)\b/.test(text)
    ? true
    : undefined;
}

/**
 * The filters a renter's sentence asks for. `today` is today in Ireland ("2026-11-17"), so
 * "from January" can be given its year. What comes back has been through the strict schema, so
 * nothing outside the allowed fields can ever be in it.
 */
export function parseSearch(sentence: string, today: string): ParsedSearch {
  const text = prepare(sentence.slice(0, 500));
  const place = placeInSentence(text);
  const candidate: Record<string, unknown> = {
    where: place?.id,
    maxRent: rent(text),
    beds: bedrooms(text),
    moveIn: moveIn(text, today),
    stay: stay(text),
    people: people(text),
    pets: pets(text),
    furnished: furnished(text),
    parking: parking(text),
    type: homeType(text),
  };
  const filters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (value === undefined) continue;
    const checked = searchFiltersSchema.shape[key as keyof SearchFilters].safeParse(value);
    if (checked.success) filters[key] = checked.data;
  }
  if (Object.keys(filters).length > 0) {
    return { filters: searchFiltersSchema.parse(filters), understood: true };
  }
  // States table, "Gaff didn't understand the words": the words are tried as a place search.
  const typed = normalise(sentence.slice(0, 60));
  const guess = typed.length >= 3 ? searchPlaces(typed, 1)[0] : undefined;
  if (guess) return { filters: { where: guess.id }, understood: true };
  return { filters: {}, understood: false };
}
