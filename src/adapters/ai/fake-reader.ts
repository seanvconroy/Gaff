import { counties } from '@/domain/lettings/new-letting';
import { linesOf, type AdvertReading, type ReadField } from '@/domain/lettings/advert-reading';
import type { AdvertReader } from '@/ports/ai';

/**
 * A deterministic stand-in for the model that reads adverts, for development and tests. It
 * finds what a plain Irish advert says in so many words, by pattern, and nothing else. Like
 * the real one it only suggests: every value comes with the words it was read from, and
 * `checkReading` decides what is kept. It follows no instruction in the text, because it
 * follows nothing at all.
 *
 * It does not look for lines about who should apply: the protected-ground check does that, in
 * code, whatever a reader says.
 */

type Found = AdvertReading['fields'][number];

const NUMBERS: Record<string, number> = {
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
};
const numberOf = (word: string) => NUMBERS[word.toLowerCase()] ?? Number(word);
const N = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)';
const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december';
const STREET =
  'road|street|avenue|lane|drive|park|place|square|terrace|court|close|way|grove|crescent|row|quay|hill|green|gardens|walk|mews|rise|heights|view|lawn|parade|mall|wood|manor';

/** Things renters ask about that have no field of their own. */
const FACT_TOPICS =
  /\b(heating|heat pump|garden|balcony|patio|bins?|broadband|wifi|fibre|dishwasher|washing machine|dryer|storage|alarm|luas|dart|bus|bike|lift|floor|bills|electricity|gas|oven|hob|fridge|freezer|shower|bath|wardrobes?|double glazing|insulated|south-facing|deposit)\b/i;

function isoDate(day: number, month: number, year: number | null, today: string): string | null {
  const two = (n: number) => String(n).padStart(2, '0');
  let y = year ?? Number(today.slice(0, 4));
  let date = `${y}-${two(month)}-${two(day)}`;
  // No year given: the next time that day comes round.
  if (year === null && date < today) {
    y += 1;
    date = `${y}-${two(month)}-${two(day)}`;
  }
  return date;
}

function read(text: string, today: string): AdvertReading {
  const lines = linesOf(text);
  const fields: Found[] = [];
  const used = new Set<string>();
  const add = (field: ReadField, value: string | number, quote: string, sure = true) => {
    if (fields.some((each) => each.field === field)) return;
    fields.push({ field, value: String(value), quote, sure });
    used.add(quote);
  };

  for (const line of lines) {
    // The address: "12 Ranelagh Road, Ranelagh, Dublin 6".
    const address = new RegExp(
      `^(?:address:\\s*)?((?:apartment|apt|flat|unit)?\\s*\\d+[a-z]?,?\\s+[A-Z][\\w' ]*?\\b(?:${STREET}))\\b,\\s*(.+?)\\.?$`,
      'i',
    ).exec(line);
    if (address) {
      const rest = address[2]!
        .split(',')
        .map((part) => part.trim())
        .filter((part) => !/^[AC-FHKNPRTV-Y]\d{2}\s?[0-9AC-FHKNPRTV-Y]{4}$/i.test(part));
      add('addressLine1', address[1]!.trim(), line);
      const county = counties.find((each) =>
        new RegExp(`\\b(?:co\\.?\\s+|county\\s+)?${each}\\b`, 'i').test(rest.join(', ')),
      );
      const area = rest.filter((part) => !/^(co\.?|county)\s+\w+$/i.test(part)).join(', ');
      if (area) add('area', area, line);
      if (county) add('county', county, line);
    }
    const eircode = /\b([AC-FHKNPRTV-Y]\d{2}|D6W)\s?([0-9AC-FHKNPRTV-Y]{4})\b/i.exec(line);
    if (eircode) add('eircode', `${eircode[1]} ${eircode[2]}`.toUpperCase(), line);

    const rent = /€\s?(\d{1,2},?\d{3}|\d{3})(?:\.\d{2})?/.exec(line);
    if (rent && !/\b(deposit|week|weekly)\b/i.test(line)) add('rent', rent[1]!, line);

    const beds = new RegExp(
      `\\b${N}(?:\\/(\\d))?[ -]?(?:double |single )?bed(?:room)?s?\\b`,
      'i',
    ).exec(line);
    // "2/3 bed": the advert isn't clear, so the person is asked to check.
    if (beds) add('bedrooms', numberOf(beds[1]!), line, !beds[2]);
    else if (/\bstudio\b/i.test(line)) add('bedrooms', 0, line);
    const baths = new RegExp(`\\b${N}[ -]?bath(?:room)?s?\\b`, 'i').exec(line);
    if (baths) add('bathrooms', numberOf(baths[1]!), line);

    const type = /\b(apartment|flat|house|bungalow|cottage|duplex|studio)\b/i.exec(line);
    if (type) {
      const word = type[1]!.toLowerCase();
      add(
        'propertyType',
        word === 'flat' ? 'apartment' : word === 'bungalow' || word === 'cottage' ? 'house' : word,
        line,
      );
    }

    if (/\bunfurnished\b/i.test(line)) add('furnished', 'unfurnished', line);
    else if (/\bpart(?:ly|ially)?[ -]furnished\b/i.test(line))
      add('furnished', 'part_furnished', line);
    else if (/\bfurnished\b/i.test(line)) add('furnished', 'furnished', line);

    const ber = /\bBER\b[^A-Za-z0-9]*(?:rating[^A-Za-z0-9]*)?([A-G][1-3]?|exempt)\b/i.exec(line);
    if (ber)
      add('berRating', ber[1]!.toLowerCase() === 'exempt' ? 'exempt' : ber[1]!.toUpperCase(), line);

    if (/\bno parking\b/i.test(line)) add('parking', 'none', line);
    else if (/\b(on[- ]street|street|permit) parking\b/i.test(line)) add('parking', 'street', line);
    else if (
      /\b(parking space|car space|designated parking|private parking|off[- ]street parking|driveway)\b/i.test(
        line,
      )
    ) {
      add('parking', 'space', line);
    }

    const named = new RegExp(
      `\\bavailable\\b[^.\\n]*?\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? (${MONTHS})(?: (\\d{4}))?`,
      'i',
    ).exec(line);
    const iso = /\bavailable\b[^.\n]*?\b(\d{4})-(\d{2})-(\d{2})\b/i.exec(line);
    if (named) {
      const month = MONTHS.split('|').indexOf(named[2]!.toLowerCase()) + 1;
      const date = isoDate(Number(named[1]), month, named[3] ? Number(named[3]) : null, today);
      if (date) add('availableFrom', date, line);
    } else if (iso) add('availableFrom', `${iso[1]}-${iso[2]}-${iso[3]}`, line);
    else if (/\bavailable (immediately|now|today)\b/i.test(line)) add('availableFrom', today, line);

    const months = new RegExp(`\\b${N}[ -]months?\\b`, 'i').exec(line);
    const years = new RegExp(`\\b${N}[ -]years?\\b`, 'i').exec(line);
    if (/\b(lease|let|contract|term)\b/i.test(line)) {
      if (months) add('leaseMonths', numberOf(months[1]!), line);
      else if (years) add('leaseMonths', numberOf(years[1]!) * 12, line);
    }
    const people = new RegExp(
      `\\b(?:max(?:imum)?(?: of)?|up to|no more than) ${N} (?:people|persons|occupants|tenants)\\b`,
      'i',
    ).exec(line);
    if (people) add('maxOccupants', numberOf(people[1]!), line);
    if (/\bno pets\b|\bpets? (?:are )?not (?:allowed|permitted|accepted)\b/i.test(line)) {
      add('noPets', 'true', line);
    }
  }

  // What's left: a short line about something renters ask is a fact; a sentence is description.
  const facts: string[] = [];
  const description: string[] = [];
  for (const line of lines) {
    const labelled = /^[A-Za-z][A-Za-z ]{1,24}:/.test(line);
    const about = /\[(name|phone|email|link)\]/.test(line);
    if (about) continue;
    const words = line.split(/\s+/).length;
    const read = used.has(line);
    if (!read && FACT_TOPICS.test(line) && words <= 8) facts.push(line);
    else if (!labelled && /[.!]$/.test(line) && (read ? words >= 8 : words >= 4)) {
      description.push(line);
    }
  }
  return { fields, facts, description, aboutWho: [] };
}

export const fakeAdvertReader: AdvertReader = {
  promptVersion: 'advert-fake-1',
  async readAdvert({ text, today }) {
    return { model: 'fake', reading: read(text, today) };
  },
};
