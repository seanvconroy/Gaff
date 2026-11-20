import { z } from 'zod';
import { type HomeWordingReason, homeWordingReason } from '@/domain/compliance/who-should-apply';
import { MAX_OCCUPANTS_LIMIT, minimumStays } from '@/domain/criteria/criteria';
import {
  type CheckThis,
  type DraftAnswers,
  type FlowProgress,
  type ReviewGroup,
  thingsToCheck,
  withAnswers,
} from './add-letting';
import {
  berRatings,
  counties,
  furnishing,
  MAX_DESCRIPTION,
  MAX_RENT_CENTS,
  MIN_RENT_CENTS,
  normaliseEircode,
  parkingOptions,
  parseEuroToCents,
  propertyTypes,
} from './new-letting';
import {
  type Appliance,
  type Heating,
  HIGHEST_FLOOR,
  LOWEST_FLOOR,
  MIN_FLOOR_AREA,
  normaliseBerNumber,
  type OutdoorSpace,
} from './more-facts';

/**
 * Reading an advert into a letting (work package WP-10: UX-LT-2, UX-LT-3, UX-LT-6, UX-LT-7,
 * UX-AI-4, UX-AI-5, UX-AI-8, UX-AI-9). The reader (the model, or its local stand-in) suggests;
 * everything here is plain code that decides what is kept:
 *
 * - names, phone numbers, email addresses and links are taken out before the reader sees
 *   anything (`stripPersonalDetails`);
 * - what the reader hands back is held to a strict schema: nothing in the pasted text can add
 *   a field, change where a value goes, or carry an instruction (`advertReadingSchema`);
 * - a value is kept only with the words it came from, and only if those words are in the text
 *   and say that value. Anything else is dropped, never guessed (`checkReading`);
 * - a line about who should apply is left out of the facts and the description, with its
 *   reason, and never becomes a criterion. The protected-ground check decides, whatever the
 *   reader said.
 *
 * Nothing here knows about any person, and nothing here is asked of the model twice.
 */

/** The most of an advert that is read. A long brochure's text is cut off here. */
export const MAX_ADVERT_CHARS = 12_000;
/** The longest run of words a value can point to as its source. */
export const MAX_QUOTE = 400;

// --- Before the reader sees it (UX-LT-7, UX-AI-8) -----------------------------------------

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
/** Digits with spaces, dashes or brackets, on one line: long enough to be a phone number. */
const PHONE = /(?<![\w€.,/-])(?:\+|00)?\(?\d[\d ()-]{6,}\d(?![\w/])/g;
/** "BER No. ", "BER number: ", "BER cert no ": what comes before a BER's own number. */
const BER_NUMBER_LABEL = /\bBER\s*(?:no\.?|number|cert(?:ificate)?\s*(?:no\.?|number))[:\s]*$/i;
const A_DATE = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[- ]\d{1,2}[- ]\d{2,4})$/;
/** Words that come before a person's name in an advert: "Contact Mary Byrne on…". */
const CUES = [
  'contact',
  'call',
  'phone',
  'email',
  'ask for',
  'speak to',
  'speak with',
  'agent',
  'landlord',
  'landlady',
  'owner',
  'regards',
  'thanks',
  'thank you',
];
const NAME_CUE = new RegExp(
  `\\b(${CUES.map((cue) => `[${cue[0]!.toUpperCase()}${cue[0]}]${cue.slice(1)}`).join('|')})` +
    "([:,]?[ \\t]+)((?:[A-Z][a-z'-]+)(?:[ \\t]+[A-Z][a-z'-]+){0,2})",
  'g',
);
/** Capitalised words after a cue that aren't a name. */
const NOT_A_NAME = new Set([
  'us',
  'me',
  'the',
  'now',
  'today',
  'on',
  'for',
  'to',
  'our',
  'or',
  'and',
  'at',
  'in',
  'is',
  'gaff',
  'daft',
  'myhome',
  'occupied',
  ...counties.map((county) => county.toLowerCase()),
]);

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Straight quotes and dashes, one space between words, no empty lines. Newlines are kept. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * UX-LT-7, UX-AI-8: takes names, phone numbers, email addresses and links out of what was
 * pasted, before any of it goes to the model. `names` are the ones Gaff already knows (the
 * person pasting, their agency); a name after a word like "Contact" or "Call" goes too.
 */
export function stripPersonalDetails(text: string, names: readonly string[] = []): string {
  let result = tidy(text.slice(0, MAX_ADVERT_CHARS * 2))
    .replace(EMAIL, '[email]')
    .replace(LINK, '[link]')
    .replace(PHONE, (found: string, at: number, whole: string) => {
      const digits = found.replace(/\D/g, '').length;
      // M40 (BA-14): nine digits labelled as the BER certificate's number are about the home.
      const berNumber =
        digits === 9 && BER_NUMBER_LABEL.test(whole.slice(Math.max(0, at - 30), at));
      return digits < 7 || berNumber || A_DATE.test(found.trim()) ? found : '[phone]';
    });
  for (const name of names) {
    for (const part of name.split(/\s+/).filter((each) => each.length > 1)) {
      result = result.replace(new RegExp(`\\b${escaped(part)}\\b`, 'gi'), '[name]');
    }
  }
  result = result.replace(NAME_CUE, (whole, cue: string, gap: string, name: string) => {
    const [first] = name.split(/[ \t]+/);
    return NOT_A_NAME.has(first!.toLowerCase()) ? whole : `${cue}${gap}[name]`;
  });
  return result.replace(/(\[name\])(?:[ \t]+\[name\])+/g, '$1').slice(0, MAX_ADVERT_CHARS);
}

const PLACEHOLDER = /\[(?:name|phone|email|link)\]/;

/**
 * UX-AI-9: words addressed to the assistant, not about a home. Nothing in the text is ever
 * followed; a line like this is also never shown to renters as a fact or a description.
 */
const TO_THE_ASSISTANT =
  /\b(ignore|disregard|forget|override)\b[^.\n]*\b(instructions?|prompts?|rules|above|previous)\b|\bsystem prompt\b|\b(you are|you're|act as|pretend to be)\b[^.\n]*\b(ai|assistant|model|chatbot)\b|\bas an ai\b|\b(add|set|create|change|update|delete|remove|return|output)\b[^.\n]*\b(fields?|values?|json|variables?|parameters?|keys?)\b/i;

/** Any link at all in what was pasted: Gaff opens none of them (Q31). */
export function linksIn(text: string): string[] {
  return text.match(LINK) ?? [];
}

/** True when what was pasted is links and nothing else: there are no words to read. */
export function isOnlyLinks(text: string): boolean {
  return linksIn(text).length > 0 && text.replace(LINK, '').trim() === '';
}

// --- What the reader hands back (UX-AI-9) -------------------------------------------------

/** Everything the reader may say it found. There is no other field, and no free-text one. */
export const readFields = [
  'addressLine1',
  'addressLine2',
  'area',
  'county',
  'eircode',
  'rent',
  'availableFrom',
  'propertyType',
  'bedrooms',
  'bathrooms',
  'furnished',
  'berRating',
  'parking',
  // M39, M40 (BA-14): more of what renters ask, where the advert says it in so many words.
  'ensuites',
  'floorArea',
  'floor',
  'lift',
  'heating',
  'outdoorSpace',
  'appliance',
  'broadband',
  'berNumber',
  // Suggestions for letting details: never switched on by Gaff (section 6).
  'leaseMonths',
  'maxOccupants',
  'noPets',
] as const;
export type ReadField = (typeof readFields)[number];

const quote = z.string().min(1).max(MAX_QUOTE);

/**
 * The strict shape of a reading. Unknown keys fail it, a field outside the list fails it, and
 * a value is a short string that the field's own rule then reads. A reading that fails is not
 * used at all: the person fills the home in themselves.
 */
export const advertReadingSchema = z.strictObject({
  fields: z
    .array(
      z.strictObject({
        field: z.enum(readFields),
        value: z.string().min(1).max(160),
        /** The words in the text that say so, copied exactly. */
        quote,
        /** False where the text is unclear ("2/3 bed"). The person is asked to check. */
        sure: z.boolean(),
      }),
    )
    .max(60),
  /** Other facts a renter might ask about, each copied exactly from the text. */
  facts: z.array(quote).max(40),
  /** The sentences that describe the home, each copied exactly from the text. */
  description: z.array(quote).max(60),
  /** Lines about who should apply, copied exactly. They are left out. */
  aboutWho: z.array(quote).max(40),
});
export type AdvertReading = z.infer<typeof advertReadingSchema>;

// --- What is kept on the draft, for the review screen ---------------------------------------

/** The answers that can show where they came from. */
export const sourcedFields = [
  'addressLine1',
  'addressLine2',
  'area',
  'county',
  'eircode',
  'rentCents',
  'availableFrom',
  'propertyType',
  'bedrooms',
  'bathrooms',
  'furnished',
  'berRating',
  'parking',
  'ensuites',
  'floorAreaSqm',
  'floor',
  'lift',
  'heating',
  'outdoorSpace',
  'appliances',
  'broadband',
  'berNumber',
  'daftUrl',
  'myhomeUrl',
] as const;
export type SourcedField = (typeof sourcedFields)[number];

/** Why a line was left out: the ground it touches, or simply that it is about who applies. */
export type LeftOutReason = HomeWordingReason;
const leftOutReasons = [
  'housing_assistance',
  'family_status',
  'civil_status',
  'gender',
  'age',
  'religion',
  'race',
  'traveller_community',
  'disability',
  'sexual_orientation',
  'about_who',
] as const satisfies readonly LeftOutReason[];

const source = z.strictObject({ quote, sure: z.boolean() });

/**
 * What the review screen needs beside the answers (UX-LT-3, UX-LT-6, UX-AI-4): the words each
 * found value came from, what the person should check, what the advert says that could be a
 * letting detail, and the lines that were left out. It lives with the draft and goes when the
 * draft becomes a letting. It holds the lister's own words about a home: never a person's
 * name or contact details, which were taken out before the text was read.
 */
export const draftReadingSchema = z.strictObject({
  from: z.enum(['advert', 'enquiry']),
  /** How many values were found, to count how many the person then changed. */
  found: z.number().int().min(0),
  sources: z.partialRecord(z.enum(sourcedFields), source),
  /** Kept in the lister's own words, copied from the text and never rewritten. */
  ownWords: z.array(z.enum(['description', 'otherFacts'])).max(2),
  /** UX-MT-4, section 6: what the advert says about the fixed criteria. A person switches them on. */
  suggested: z.strictObject({
    noPets: z.strictObject({ quote }).optional(),
    minStayMonths: z
      .strictObject({ value: z.union(minimumStays.map((m) => z.literal(m))), quote })
      .optional(),
    maxOccupants: z
      .strictObject({ value: z.number().int().min(1).max(MAX_OCCUPANTS_LIMIT), quote })
      .optional(),
  }),
  leftOut: z.array(z.strictObject({ line: quote, reason: z.enum(leftOutReasons) })).max(20),
});
export type DraftReading = z.infer<typeof draftReadingSchema>;

export const emptyReading = (from: DraftReading['from']): DraftReading => ({
  from,
  found: 0,
  sources: {},
  ownWords: [],
  suggested: {},
  leftOut: [],
});

// --- Deciding what is kept (UX-LT-3, UX-AI-5) -----------------------------------------------

/** Lower case, one space between words: how words are compared, never how they are shown. */
const flat = (text: string) => tidy(text).replace(/\s+/g, ' ').toLowerCase();

const ABBREVIATIONS =
  /(?:^|[\s(])(?:co|st|rd|ave|no|approx|e\.g|i\.e|dr|mr|mrs|ms|min|mins|sq|ft|incl|excl|tel)\.$/i;

/**
 * The lines of an advert: each line of the text, and each sentence in a line. A line that is
 * left out is left out whole, so nothing about who should apply rides in on the rest of it.
 */
export function linesOf(text: string): string[] {
  const lines: string[] = [];
  for (const row of tidy(text).split('\n')) {
    const pieces = row.split(/(?<=[.!?])\s+(?=[A-Z0-9€"'[])/);
    let held = '';
    for (const piece of pieces) {
      const joined = held ? `${held} ${piece}` : piece;
      // "Ranelagh, Co. Dublin" is one sentence, whatever its full stop suggests.
      if (ABBREVIATIONS.test(joined)) held = joined;
      else {
        lines.push(joined);
        held = '';
      }
    }
    if (held) lines.push(held);
  }
  return lines.map((line) => line.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
}

interface Placed {
  line: string;
  start: number;
  end: number;
}

/** Where each line sits in the text, as compared. */
function place(text: string): { whole: string; lines: Placed[] } {
  const whole = flat(text);
  const lines: Placed[] = [];
  let cursor = 0;
  for (const line of linesOf(text)) {
    const at = whole.indexOf(flat(line), cursor);
    if (at === -1) continue;
    lines.push({ line, start: at, end: at + flat(line).length });
    cursor = at + flat(line).length;
  }
  return { whole, lines };
}

/** Every place these words appear in the text. None: they aren't in it. */
function placesOf(words: string, whole: string): Array<{ start: number; end: number }> {
  const wanted = flat(words);
  if (!wanted) return [];
  const found: Array<{ start: number; end: number }> = [];
  for (let at = whole.indexOf(wanted); at !== -1; at = whole.indexOf(wanted, at + 1)) {
    found.push({ start: at, end: at + wanted.length });
  }
  return found;
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];
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

/** The words say this number: as a figure on its own, or as a word. */
function saysNumber(words: string, n: number): boolean {
  const word = NUMBER_WORDS[n];
  return (
    new RegExp(`(?<![\\d.,])${n}(?![\\d]|[.,]\\d)`).test(words) ||
    (word !== undefined && new RegExp(`\\b${word}\\b`).test(words))
  );
}

const wholeNumber = (value: string, min: number, max: number): number | null => {
  const n = Number(value.trim());
  return /^\d{1,3}$/.test(value.trim()) && n >= min && n <= max ? n : null;
};

function realDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The words give this date: its day and its month, and its year where they give one. */
function saysDate(words: string, date: string, today: string): boolean {
  if (/\b(immediately|now|today|asap)\b/.test(words)) return date === today;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const name = MONTHS[month - 1]!;
  const numeric = new RegExp(
    `(?<!\\d)0?${day}[/.-]0?${month}(?:[/.-](?:${year}|${year % 100}))?(?!\\d)`,
  );
  const iso = words.includes(date);
  const named =
    new RegExp(`(?<!\\d)0?${day}(?:st|nd|rd|th)?(?!\\d)`).test(words) &&
    new RegExp(`\\b${name.slice(0, 3)}`).test(words);
  if (!iso && !named && !numeric.test(words)) return false;
  const years = words.match(/\b(?:19|20)\d{2}\b/g);
  if (years) return years.includes(String(year));
  // No year given: it can only mean the next time that day comes round.
  const inAYear = new Date(new Date(`${today}T00:00:00Z`).getTime() + 366 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return date >= today && date <= inAYear;
}

const TYPE_WORDS: Record<keyof typeof propertyTypes, RegExp> = {
  apartment: /\b(apartment|flat|apt)\b/,
  house: /\b(house|bungalow|cottage|terrace|terraced|detached|semi-detached|townhouse)\b/,
  duplex: /\bduplex\b/,
  studio: /\bstudio\b/,
  other: /./,
};

const ORDINALS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
};

const HEATING_WORDS: Record<Heating, RegExp | null> = {
  gas: /\bgas\b/,
  oil: /\boil\b/,
  electric: /\belectric(al)? (storage )?heat|\bstorage heaters?\b/,
  heat_pump: /\bheat pump\b/,
  district: /\bdistrict heating\b/,
  solid_fuel: /\bsolid fuel\b|\bstove\b|\bopen fire\b/,
  other: null,
};

const OUTDOOR_WORDS: Record<OutdoorSpace, RegExp> = {
  none: /\bno (outdoor space|garden)\b/,
  balcony: /\bbalcon(y|ies)\b/,
  patio: /\bpatio\b|\byard\b|\bcourtyard\b/,
  garden: /\b(private|rear|back|front|own) garden\b/,
  shared_garden: /\b(shared|communal) gardens?\b/,
};

const APPLIANCE_WORDS: Record<Appliance, RegExp> = {
  washing_machine: /\bwashing machine\b|\bwasher[- ]dryer\b/,
  dryer: /\b(tumble )?dryer\b/,
  dishwasher: /\bdish ?washer\b/,
};

type Kept =
  | { to: 'answer'; patch: Partial<DraftAnswers>; key: SourcedField }
  | { to: 'suggestion'; key: 'noPets' | 'minStayMonths' | 'maxOccupants'; value: number | true };

/**
 * One value the reader gave, held to its field's rule and to the words it points at. Null
 * where the value isn't one the field can hold, or the words don't say it: then it is dropped.
 */
function keep(field: ReadField, raw: string, words: string, today: string): Kept | null {
  const value = raw.trim();
  const verbatim = () => words.includes(flat(value));
  const answer = (key: SourcedField, patch: Partial<DraftAnswers>): Kept => ({
    to: 'answer',
    key,
    patch,
  });
  switch (field) {
    case 'addressLine1':
      return value.length >= 3 && value.length <= 120 && verbatim() && !PLACEHOLDER.test(value)
        ? answer('addressLine1', { addressLine1: value })
        : null;
    case 'addressLine2':
      return value.length <= 120 && verbatim() && !PLACEHOLDER.test(value)
        ? answer('addressLine2', { addressLine2: value })
        : null;
    case 'area':
      return value.length >= 2 && value.length <= 80 && verbatim() && !PLACEHOLDER.test(value)
        ? answer('area', { area: value })
        : null;
    case 'county': {
      const county = counties.find((each) => each.toLowerCase() === value.toLowerCase());
      return county && new RegExp(`\\b${county.toLowerCase()}\\b`).test(words)
        ? answer('county', { county })
        : null;
    }
    case 'eircode': {
      const eircode = normaliseEircode(value);
      return eircode && words.replace(/\s/g, '').includes(eircode.replace(' ', '').toLowerCase())
        ? answer('eircode', { eircode })
        : null;
    }
    case 'rent': {
      const cents = parseEuroToCents(value);
      if (cents === null || cents < MIN_RENT_CENTS || cents > MAX_RENT_CENTS) return null;
      // A rent by the week or for a room isn't the rent a month: it is never worked out.
      if (/\b(week|weekly|pw|p\.w)\b/.test(words)) return null;
      const figures = words.replace(/(?<=\d),(?=\d{3}\b)/g, '');
      const euro = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
      return new RegExp(`(?<![\\d.])${escaped(euro)}(?:\\.00)?(?!\\d)`).test(figures)
        ? answer('rentCents', { rentCents: cents })
        : null;
    }
    case 'availableFrom':
      return realDate(value) && saysDate(words, value, today)
        ? answer('availableFrom', { availableFrom: value })
        : null;
    case 'propertyType': {
      const type = (Object.keys(propertyTypes) as Array<keyof typeof propertyTypes>).find(
        (each) => each === value,
      );
      return type && TYPE_WORDS[type].test(words)
        ? answer('propertyType', { propertyType: type })
        : null;
    }
    case 'bedrooms': {
      const n = wholeNumber(value, 0, 10);
      if (n === null) return null;
      const said = n === 0 ? /\bstudio\b/.test(words) : saysNumber(words, n) && /bed/.test(words);
      return said ? answer('bedrooms', { bedrooms: n }) : null;
    }
    case 'bathrooms': {
      const n = wholeNumber(value, 1, 10);
      return n !== null && saysNumber(words, n) && /bath|shower room|wc\b/.test(words)
        ? answer('bathrooms', { bathrooms: n })
        : null;
    }
    case 'furnished': {
      const said: Record<keyof typeof furnishing, boolean> = {
        unfurnished: /\bunfurnished\b|\bnot furnished\b/.test(words),
        part_furnished: /\bpart(ly|ially)?[ -]furnished\b/.test(words),
        furnished:
          /\bfurnished\b/.test(words) &&
          !/\bunfurnished\b|\bnot furnished\b|\bpart(ly|ially)?[ -]furnished\b/.test(words),
      };
      const choice = (Object.keys(furnishing) as Array<keyof typeof furnishing>).find(
        (each) => each === value,
      );
      return choice && said[choice] ? answer('furnished', { furnished: choice }) : null;
    }
    case 'berRating': {
      const rating = berRatings.find((each) => each.toLowerCase() === value.toLowerCase());
      if (!rating || !/\b(ber|energy)\b/.test(words)) return null;
      const said =
        rating === 'exempt'
          ? /\bexempt\b/.test(words)
          : new RegExp(`\\b${rating.toLowerCase()}\\b`).test(words);
      return said ? answer('berRating', { berRating: rating }) : null;
    }
    case 'parking': {
      const choice = (Object.keys(parkingOptions) as Array<keyof typeof parkingOptions>).find(
        (each) => each === value,
      );
      return choice && /\bpark|car space|driveway|garage/.test(words)
        ? answer('parking', { parking: choice })
        : null;
    }
    // M39, M40 (BA-14): each only where the words say it.
    case 'ensuites': {
      const n = wholeNumber(value, 1, 10);
      return n !== null && saysNumber(words, n) && /\ben[- ]?suites?\b/.test(words)
        ? answer('ensuites', { ensuites: n })
        : null;
    }
    case 'floorArea': {
      const n = wholeNumber(value.replace(/\s*(m2|m²|sq\.? ?m)$/i, ''), MIN_FLOOR_AREA, 999);
      return n !== null &&
        new RegExp(`(?<![\\d.,])${n}(?![\\d])`).test(words) &&
        /(sq\.? ?m|m2|m²|square met)/.test(words)
        ? answer('floorAreaSqm', { floorAreaSqm: n })
        : null;
    }
    case 'floor': {
      const n = /^-?\d{1,2}$/.test(value) ? Number(value) : null;
      if (n === null || n < LOWEST_FLOOR || n > HIGHEST_FLOOR) return null;
      if (!/\b(floor|storey)\b/.test(words) || /floor (area|space|plan)/.test(words)) return null;
      const said =
        n === 0
          ? /\bground[- ]floor\b/.test(words)
          : n < 0
            ? /\bbasement\b|\blower[- ]ground\b/.test(words)
            : saysNumber(words, n) || new RegExp(`\\b${ORDINALS[n] ?? '-'}\\b`).test(words);
      return said ? answer('floor', { floor: n }) : null;
    }
    case 'lift': {
      const none = /\bno lift\b|\bwithout a lift\b|\bnot? (a )?lift\b/.test(words);
      if (/^(yes|true)$/i.test(value)) {
        return /\b(lift|elevator)\b/.test(words) && !none ? answer('lift', { lift: true }) : null;
      }
      return /^(no|false)$/i.test(value) && none ? answer('lift', { lift: false }) : null;
    }
    case 'heating': {
      const said = HEATING_WORDS[value as Heating];
      return said && said.test(words) ? answer('heating', { heating: value as Heating }) : null;
    }
    case 'outdoorSpace': {
      const said = OUTDOOR_WORDS[value as OutdoorSpace];
      return said && said.test(words)
        ? answer('outdoorSpace', { outdoorSpace: value as OutdoorSpace })
        : null;
    }
    case 'appliance': {
      const said = APPLIANCE_WORDS[value as Appliance];
      return said && said.test(words)
        ? answer('appliances', { appliances: [value as Appliance] })
        : null;
    }
    case 'broadband': {
      const fibre = /\bfib(re|er)\b/.test(words);
      if (value === 'fibre') return fibre ? answer('broadband', { broadband: 'fibre' }) : null;
      return value === 'other' && !fibre && /\b(broadband|wi-?fi|internet)\b/.test(words)
        ? answer('broadband', { broadband: 'other' })
        : null;
    }
    case 'berNumber': {
      const number = normaliseBerNumber(value);
      return number && /\bber\b/.test(words) && words.replace(/[\s-]/g, '').includes(number)
        ? answer('berNumber', { berNumber: number })
        : null;
    }
    case 'leaseMonths': {
      const months = minimumStays.find((each) => String(each) === value);
      if (!months || !/\b(lease|let|term|contract|tenancy|stay)\b/.test(words)) return null;
      const said =
        (saysNumber(words, months) && /\bmonth/.test(words)) ||
        (months % 12 === 0 &&
          /\byear/.test(words) &&
          (saysNumber(words, months / 12) || (months === 12 && /\b(a|per) year\b/.test(words))));
      return said ? { to: 'suggestion', key: 'minStayMonths', value: months } : null;
    }
    case 'maxOccupants': {
      const n = wholeNumber(value, 1, MAX_OCCUPANTS_LIMIT);
      return n !== null &&
        saysNumber(words, n) &&
        /\b(max|maximum|up to|no more than|at most)\b/.test(words) &&
        /\b(people|persons|person|occupants|tenants)\b/.test(words)
        ? { to: 'suggestion', key: 'maxOccupants', value: n }
        : null;
    }
    case 'noPets':
      return /^(true|yes)$/i.test(value) &&
        /\bno pets\b|\bpets?( are)? not (allowed|permitted|accepted)\b/.test(words)
        ? { to: 'suggestion', key: 'noPets', value: true }
        : null;
  }
}

export interface CheckedReading {
  /** What goes into the draft: only what the text says. */
  answers: DraftAnswers;
  reading: DraftReading;
  /** How many things the reader gave that code dropped. */
  dropped: number;
}

/** Tidied for showing: no bullet, no full stop left hanging, a capital to start. */
const asFact = (words: string) => {
  const text = words
    .replace(/^[-•*]\s*/, '')
    .replace(/[.;,]+$/, '')
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * UX-LT-3, UX-LT-6, UX-AI-5, UX-AI-9: turns what the reader handed back into what the draft
 * keeps. `text` is exactly what the reader was given. `raw` is whatever came back: it is
 * trusted for nothing.
 *
 * Returns null where `raw` isn't a reading at all (it breaks the schema): nothing is used.
 */
export function checkReading(
  text: string,
  raw: unknown,
  today: string,
  from: DraftReading['from'] = 'advert',
): CheckedReading | null {
  const parsed = advertReadingSchema.safeParse(raw);
  if (!parsed.success) return null;
  const given = parsed.data;
  const { whole, lines } = place(text);
  let dropped = 0;

  // Lines about who should apply. The protected-ground check decides (rule 3); the reader can
  // add a near miss ("quiet tenant"), and can never take one away.
  const leftOut = new Map<Placed, LeftOutReason>();
  for (const line of lines) {
    const wording = homeWordingReason(line.line);
    if (wording) leftOut.set(line, wording.reason);
  }
  for (const words of given.aboutWho) {
    for (const at of placesOf(words, whole)) {
      for (const line of lines) {
        if (line.start < at.end && at.start < line.end && !leftOut.has(line)) {
          leftOut.set(line, 'about_who');
        }
      }
    }
  }
  const out = [...leftOut.keys()];
  /** These words are in the text, somewhere that wasn't left out. */
  const usable = (words: string) =>
    placesOf(words, whole).some(
      (at) => !out.some((line) => line.start < at.end && at.start < line.end),
    );
  const position = (words: string) => placesOf(words, whole)[0]?.start ?? -1;

  // The home's details. A value is kept with the words it came from, or not at all.
  let answers: DraftAnswers = {};
  const reading = emptyReading(from);
  for (const item of given.fields) {
    const words = flat(item.quote);
    const kept =
      placesOf(item.quote, whole).length > 0 ? keep(item.field, item.value, words, today) : null;
    // A line about who should apply never becomes a criterion, or a suggestion for one.
    if (!kept || (kept.to === 'suggestion' && !usable(item.quote))) {
      dropped += 1;
      continue;
    }
    const said = tidy(item.quote).replace(/\n/g, ' ');
    if (kept.to === 'suggestion') {
      // What the advert says about a fixed criterion. Never switched on here (section 6).
      if (kept.key === 'noPets') reading.suggested.noPets ??= { quote: said };
      else if (kept.key === 'minStayMonths') {
        reading.suggested.minStayMonths ??= {
          value: kept.value as (typeof minimumStays)[number],
          quote: said,
        };
      } else reading.suggested.maxOccupants ??= { value: kept.value as number, quote: said };
      continue;
    }
    const before = reading.sources[kept.key];
    if (before && kept.key === 'appliances') {
      // Each appliance the advert names is one more on the list, from its own words.
      const list = [...new Set([...(answers.appliances ?? []), ...(kept.patch.appliances ?? [])])];
      answers = withAnswers(answers, { appliances: list });
      continue;
    }
    if (before) {
      // Said twice. If the two differ, the first stays and the person is asked to check.
      const [key] = Object.keys(kept.patch) as Array<keyof DraftAnswers>;
      if (key && answers[key] !== kept.patch[key]) before.sure = false;
      continue;
    }
    answers = withAnswers(answers, kept.patch);
    reading.sources[kept.key] = { quote: said, sure: item.sure };
  }

  // Words renters will read: only the lister's own, only about the home (rule 3, rule 7).
  const fit = (words: string, max: number) =>
    words.length >= 3 &&
    words.length <= max &&
    usable(words) &&
    !PLACEHOLDER.test(words) &&
    !TO_THE_ASSISTANT.test(words) &&
    homeWordingReason(words) === null;

  const facts: string[] = [];
  for (const words of given.facts) {
    const fact = asFact(tidy(words).replace(/\n/g, ' '));
    if (!fit(fact, 300)) dropped += 1;
    else if (facts.length < 20 && !facts.some((each) => flat(each) === flat(fact)))
      facts.push(fact);
  }
  const sentences = given.description
    .map((words) => tidy(words).replace(/\n/g, ' '))
    .filter((words) => {
      if (fit(words, MAX_QUOTE)) return true;
      dropped += 1;
      return false;
    })
    .filter((words, index, all) => all.findIndex((each) => flat(each) === flat(words)) === index)
    .sort((a, b) => position(a) - position(b));
  let description = '';
  for (const sentence of sentences) {
    const next = description ? `${description} ${sentence}` : sentence;
    if (next.length > MAX_DESCRIPTION) break;
    description = next;
  }
  // Once more on the whole: sentences that are fine apart must be fine together.
  if (description && homeWordingReason(description)) description = '';

  if (facts.length > 0) {
    answers = withAnswers(answers, { otherFacts: facts });
    reading.ownWords.push('otherFacts');
  }
  if (description) {
    answers = withAnswers(answers, { description });
    reading.ownWords.unshift('description');
  }
  reading.leftOut = out
    .sort((a, b) => a.start - b.start)
    .slice(0, 20)
    .map((line) => ({ line: line.line.slice(0, MAX_QUOTE), reason: leftOut.get(line)! }));

  reading.found = stillAsRead(reading);
  return { answers, reading: draftReadingSchema.parse(reading), dropped };
}

// --- The review screen (UX-LT-3, UX-LT-4, UX-AI-4) ------------------------------------------

const checkOf: Record<SourcedField, CheckThis | null> = {
  addressLine1: 'address',
  addressLine2: 'address',
  area: 'address',
  county: 'address',
  eircode: 'address',
  rentCents: 'rent',
  availableFrom: 'available_from',
  propertyType: 'home',
  bedrooms: 'home',
  bathrooms: 'home',
  furnished: 'home',
  parking: 'home',
  ensuites: 'home',
  floorAreaSqm: 'home',
  floor: 'home',
  lift: 'home',
  heating: 'home',
  outdoorSpace: 'home',
  appliances: 'home',
  broadband: 'home',
  berNumber: 'ber',
  berRating: 'ber',
  daftUrl: null,
  myhomeUrl: null,
};

const suggests = (reading: DraftReading) => Object.keys(reading.suggested).length > 0;

/**
 * UX-LT-3: what the review asks the person to look at. What's missing or out of date, as for
 * any home (`thingsToCheck`); and, for a home that was read, anything the text wasn't clear
 * about, and anything the advert says that could be a letting detail.
 */
export function reviewChecks(
  progress: FlowProgress,
  today: string,
  reading: DraftReading | null,
): CheckThis[] {
  const checks = thingsToCheck(progress, today);
  if (!reading) return checks;
  for (const field of sourcedFields) {
    const check = checkOf[field];
    if (check && reading.sources[field]?.sure === false && !checks.includes(check)) {
      checks.push(check);
    }
  }
  if (suggests(reading) && !progress.answers.criteria) checks.push('details');
  return checks;
}

const groupFields: Record<ReviewGroup | 'details', readonly SourcedField[]> = {
  address: ['addressLine1', 'addressLine2', 'area', 'county', 'eircode'],
  rent: ['rentCents', 'availableFrom'],
  home: [
    'propertyType',
    'bedrooms',
    'bathrooms',
    'furnished',
    'berRating',
    'parking',
    'ensuites',
    'floorAreaSqm',
    'floor',
    'lift',
    'heating',
    'outdoorSpace',
    'appliances',
    'broadband',
    'berNumber',
  ],
  description: [],
  details: [],
};

/**
 * UX-AI-4: what a reading says once a person has saved one part of the review. A value they
 * changed is theirs now: its source goes, and so does the AI mark. A value they left is still
 * what the advert said, and they have looked at it, so it no longer asks to be checked.
 */
export function readingAfterSave(
  reading: DraftReading,
  group: ReviewGroup | 'details',
  before: DraftAnswers,
  after: DraftAnswers,
): DraftReading {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const sources = { ...reading.sources };
  for (const field of groupFields[group]) {
    const source = sources[field];
    if (!source) continue;
    if (!same(before[field], after[field])) delete sources[field];
    else sources[field] = { ...source, sure: true };
  }
  const ownWords =
    group === 'description' || group === 'home'
      ? reading.ownWords.filter((each) => same(before[each], after[each]))
      : reading.ownWords;
  return draftReadingSchema.parse({
    ...reading,
    sources,
    ownWords,
    // The person has seen what the advert says about letting details, and decided.
    suggested: group === 'details' ? {} : reading.suggested,
  });
}

/** How many of the values that were read are still as they were read. */
function stillAsRead(reading: DraftReading): number {
  return Object.keys(reading.sources).length + reading.ownWords.length;
}

/** How many of the reading's values the person changed on review (the import funnel's measure). */
export function fieldsChanged(reading: DraftReading): number {
  return Math.max(0, reading.found - stillAsRead(reading));
}
