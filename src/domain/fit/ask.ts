import { z } from 'zod';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { whoShouldApplyPhrase } from '@/domain/compliance/who-should-apply';
import { MAX_OCCUPANTS_ANSWER, type RenterAnswers } from '@/domain/criteria/answers';
import { irishToday } from '@/lib/format';

/**
 * "Ask about who's enquired" (UX-LP-15, UX-MT-18, UX-AI-6, UX-AI-7, Q36, Q37): an operator asks
 * about the people on a letting in their own words, and Gaff turns the words into a filter on
 * the four answers and the time of enquiry. The same filter can be set by tapping its chips.
 *
 * This is plain code, so it works the same with the model switched off. It can only ever produce
 * the fields of `peopleFilterSchema`. Anything else is declined, in the fixed words of section 6:
 * "who's the best tenant?", anything that touches a protected ground, work or income, where
 * someone is from, a family, a name. A decline names nobody and keeps nothing of the question.
 *
 * A filter only narrows the list the person is looking at, in the ranking's own order. It never
 * ranks, scores, recommends, hides anyone for good, or does anything (rule 1, UX-MT-8).
 */

/** The longest question that is read. Anything longer is declined unread. */
export const MAX_QUESTION = 200;

const isoDate = z.iso.date();

/** A filter on the four answers and the time of enquiry, and nothing else. */
export const peopleFilterSchema = z.strictObject({
  /** They said they could move in on or before this date. */
  moveInBy: isoDate.optional(),
  /** They said they'd stay at least this many months. */
  stayAtLeast: z.number().int().min(1).max(60).optional(),
  /** They said this many people or fewer would live there. */
  peopleAtMost: z.number().int().min(1).max(MAX_OCCUPANTS_ANSWER).optional(),
  /** What they said about pets. Assistance dogs are never pets, and never asked about. */
  pets: z.enum(['none', 'some']).optional(),
  /** Their answers meet everything that was asked. */
  meetsAll: z.literal(true).optional(),
  /** Whether they've answered the questions at all. */
  answered: z.boolean().optional(),
  /** They first enquired on or after this day (Irish time). */
  enquiredFrom: isoDate.optional(),
  /** They first enquired before this day (Irish time). */
  enquiredBefore: isoDate.optional(),
});
export type PeopleFilter = z.infer<typeof peopleFilterSchema>;
export type FilterKey = keyof PeopleFilter;

export function isEmptyFilter(filter: PeopleFilter): boolean {
  return Object.values(filter).every((value) => value === undefined);
}

/** What a filter reads about a person: their answers, how they fit, and when they enquired. */
export interface Filterable {
  answers: RenterAnswers | null;
  answeredAt: Date | null;
  met: number;
  total: number;
  enquiredAt: Date;
}

/** Whether one person's answers and enquiry time are within the filter. */
export function inFilter(person: Filterable, filter: PeopleFilter): boolean {
  const a = person.answeredAt ? (person.answers ?? {}) : {};
  if (filter.moveInBy && !(a.moveInDate !== undefined && a.moveInDate <= filter.moveInBy)) {
    return false;
  }
  if (filter.stayAtLeast && !(a.stayMonths !== undefined && a.stayMonths >= filter.stayAtLeast)) {
    return false;
  }
  if (filter.peopleAtMost && !(a.occupants !== undefined && a.occupants <= filter.peopleAtMost)) {
    return false;
  }
  if (filter.pets === 'none' && a.hasPets !== false) return false;
  if (filter.pets === 'some' && a.hasPets !== true) return false;
  if (filter.meetsAll && !(person.answeredAt && person.total > 0 && person.met === person.total)) {
    return false;
  }
  if (filter.answered !== undefined && (person.answeredAt !== null) !== filter.answered) {
    return false;
  }
  const day = irishToday(person.enquiredAt);
  if (filter.enquiredFrom && day < filter.enquiredFrom) return false;
  if (filter.enquiredBefore && day >= filter.enquiredBefore) return false;
  return true;
}

/** Everyone within the filter, in the order they came: the ranking's. Nobody is moved. */
export function filterPeople<T extends Filterable>(
  people: readonly T[],
  filter: PeopleFilter,
): T[] {
  return people.filter((person) => inFilter(person, filter));
}

// --- The filter in the address ----------------------------------------------------------

/** The filter's place in the address of People. Only codes, numbers and dates: never words. */
export const filterParams: Record<FilterKey, string> = {
  moveInBy: 'movein',
  stayAtLeast: 'stay',
  peopleAtMost: 'people',
  pets: 'pets',
  meetsAll: 'meets',
  answered: 'answered',
  enquiredFrom: 'since',
  enquiredBefore: 'before',
};

/** Reads the filter from the address. Anything that isn't a valid value is ignored. */
export function filterFromParams(
  params: Readonly<Record<string, string | undefined>>,
): PeopleFilter {
  const read = (key: FilterKey) => params[filterParams[key]];
  const number = (value: string | undefined) =>
    value && /^\d{1,2}$/.test(value) ? Number(value) : undefined;
  const filter: Record<string, unknown> = {
    moveInBy: read('moveInBy'),
    stayAtLeast: number(read('stayAtLeast')),
    peopleAtMost: number(read('peopleAtMost')),
    pets: read('pets'),
    meetsAll: read('meetsAll') === 'all' ? true : undefined,
    answered: read('answered') === 'yes' ? true : read('answered') === 'no' ? false : undefined,
    enquiredFrom: read('enquiredFrom'),
    enquiredBefore: read('enquiredBefore'),
  };
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    const one = peopleFilterSchema.shape[key as FilterKey].safeParse(value);
    if (one.success && one.data !== undefined) kept[key] = one.data;
  }
  return kept as PeopleFilter;
}

/** The filter as address parameters, in a fixed order. */
export function filterToParams(filter: PeopleFilter): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const key of Object.keys(filterParams) as FilterKey[]) {
    const value = filter[key];
    if (value === undefined) continue;
    const text =
      key === 'meetsAll' ? 'all' : key === 'answered' ? (value ? 'yes' : 'no') : String(value);
    out.push([filterParams[key], text]);
  }
  return out;
}

/**
 * People's address (UX-LP-8, UX-LP-15): the stage's chip, the filter, a person's sheet, and
 * whether a question was just declined. Never the question's words.
 */
export function peopleHref(
  lettingId: string,
  at: { show?: string | null; filter?: PeopleFilter; person?: string | null; declined?: boolean },
): string {
  const params: Array<[string, string]> = [['view', 'people']];
  if (at.show && at.show !== 'all') params.push(['show', at.show]);
  params.push(...filterToParams(at.filter ?? {}));
  if (at.declined) params.push(['asked', 'no']);
  if (at.person) params.push(['person', at.person]);
  return `/lettings/${lettingId}?${new URLSearchParams(params).toString()}`;
}

/** One chip of "Their answers": a part of a filter, and whether it is on. */
export interface AnswerChip {
  key: FilterKey;
  /** The filter this chip stands for, on its own. */
  part: PeopleFilter;
  current: boolean;
  /** The filter after tapping it: the part added, or taken away. */
  next: PeopleFilter;
}

/**
 * UX-LP-15: the chips a question sets, which can also be set by tapping. One for each criterion
 * asked, at what was asked; "Meets everything you asked"; and any other part a question set.
 */
export function answerChips(
  criteria: {
    moveInBy?: string;
    minStayMonths?: number;
    maxOccupants?: number;
    noPets: boolean;
  },
  filter: PeopleFilter,
): AnswerChip[] {
  const offered: PeopleFilter = {
    ...(criteria.moveInBy ? { moveInBy: criteria.moveInBy } : {}),
    ...(criteria.minStayMonths ? { stayAtLeast: criteria.minStayMonths } : {}),
    ...(criteria.maxOccupants ? { peopleAtMost: criteria.maxOccupants } : {}),
    ...(criteria.noPets ? { pets: 'none' as const } : {}),
    ...(criteria.moveInBy || criteria.minStayMonths || criteria.maxOccupants || criteria.noPets
      ? { meetsAll: true as const }
      : {}),
  };
  const chips: AnswerChip[] = [];
  for (const key of Object.keys(filterParams) as FilterKey[]) {
    const value = filter[key] ?? offered[key];
    if (value === undefined) continue;
    const part = { [key]: value } as PeopleFilter;
    const current = filter[key] === value;
    const next: PeopleFilter = { ...filter };
    if (current) delete next[key];
    else Object.assign(next, part);
    chips.push({ key, part, current, next });
  }
  return chips;
}

// --- Reading a question -----------------------------------------------------------------

export type AskReading =
  | { kind: 'filter'; filter: PeopleFilter }
  /** About something Gaff never sorts people by: declined before anything else is tried. */
  | { kind: 'declined'; why: 'not_allowed' }
  /** Nothing in it was understood. The model may be asked, where it is on; otherwise declined. */
  | { kind: 'declined'; why: 'not_understood' };

/**
 * Words that ask Gaff to judge, choose or act, or that reach for who a person is rather than
 * what they answered (UX-MT-17, UX-AI-6, UX-AI-7). The protected-ground and "who should apply"
 * checks run as well. Like them, this errs towards declining: a declined question costs a tap.
 */
const NOT_ALLOWED: RegExp[] = [
  // Judging or choosing a person.
  /\b(?:best|better|worst|ideal|suitab\w*|suits?|nicest|nice|nicer|good|great|perfect|reliable|trust\w*|safe|safest|risky|decent|respectable|quiet|clean|tidy|responsible|genuine|serious|likely|recommend\w*|prefer\w*|favou?rite|rank\w*|score\w*|rate|rating|top|pick|choose|chosen|shortlist\w*|reject\w*|invite\w*|offer\w*|should i|would you|winner|deserv\w*)\b/,
  // Work, money and documents: staged data, and never a filter (rule 2, rule 3).
  /\b(?:jobs?|work\w*|employ\w*|unemploy\w*|career|occupation|income|earn\w*|salary|salaries|wages?|money|afford\w*|rich|wealthy|poor|paid|pay\w*|savings|credit|debt|guarantor|references?|referee|deposit|landlord reference|background|criminal|garda|vetting|student\w*|college|universit\w*|nurse|doctor|teacher)\b/,
  // Who someone is: where they're from, how they speak or write, a family, a body.
  /\b(?:irish|nationality|national|foreign\w*|country|countries|citizen\w*|visa|passport|immigra\w*|language|accent|english|speak\w*|writ\w*|spelling|grammar|name|names|called|surname|photo\w*|looks?|old|older|younger|age|ages|aged|birthday|born|he|she|his|her|hers|him|guy|guys|lads?|lass|man|woman|mr|mrs|ms|miss|wife|husband|partner|boyfriend|girlfriend|kids?|baby|babies|pregnan\w*|married|single|divorced|health|sick|ill|wheelchair|smok\w*|drink\w*|party|parties|religio\w*|church|mass)\b/,
  // An assistance dog is never a pet, and never asked about (rule 3, disability ground).
  /\b(?:assistance|guide|service|support|therapy) (?:dogs?|animals?)\b/,
];

const NUMBER_WORDS: Record<string, number> = {
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
};
const NUMBER = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
const toNumber = (word: string): number => NUMBER_WORDS[word] ?? Number(word);

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const MONTH = `(${Object.keys(MONTHS).join('|')})`;

function prepare(question: string): string {
  return ` ${question
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[,;!?()"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function lastDayOf(year: number, month: number): string {
  return iso(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

/** The next time a day of a month comes round, from today. Null if there is no such day. */
function nextDay(today: string, month: number, day: number): string | null {
  const [year, thisMonth, thisDay] = today.split('-').map(Number) as [number, number, number];
  const chosen = month < thisMonth || (month === thisMonth && day < thisDay) ? year + 1 : year;
  const date = new Date(Date.UTC(chosen, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return iso(chosen, month, day);
}

/** The month's year: this year, or next if it has passed. */
function yearOfMonth(today: string, month: number): number {
  const [year, thisMonth] = today.split('-').map(Number) as [number, number];
  return month < thisMonth ? year + 1 : year;
}

/**
 * A date said in words, as the last day it allows: "by 1 December" is 1 December, "before 1
 * December" is 30 November, "before Christmas" is 24 December, "in January" is 31 January.
 */
function lastDayAllowed(text: string, today: string): string | null {
  const [year, month] = today.split('-').map(Number) as [number, number];
  if (/\b(?:now|straight away|right away|immediately|asap|today)\b/.test(text)) return today;
  if (/\b(?:before|by|for|until|till) (?:christmas|xmas)(?: day)?\b/.test(text)) {
    return nextDay(today, 12, 24);
  }
  if (/\b(?:before|by|for) (?:the )?new year\b/.test(text)) return lastDayOf(year, 12);
  if (/\b(?:by|before) (?:the )?end of (?:the |this )?month\b|\bthis month\b/.test(text)) {
    return lastDayOf(year, month);
  }
  if (/\bnext month\b/.test(text)) {
    return month === 12 ? lastDayOf(year + 1, 1) : lastDayOf(year, month + 1);
  }
  const within = new RegExp(`\\b(?:in|within) (?:the next )?${NUMBER} (days?|weeks?)\\b`).exec(
    text,
  );
  if (within) {
    const n = toNumber(within[1]!);
    return addDays(today, within[2]!.startsWith('week') ? n * 7 : n);
  }
  if (/\b(?:in|within) a week\b|\bthis week\b/.test(text)) return addDays(today, 7);
  const dayFirst = new RegExp(
    `\\b(by|before|on|for|until|till|from)? ?(?:the )?(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MONTH}\\b`,
  ).exec(text);
  const monthFirst = new RegExp(
    `\\b(by|before|on|for|until|till|from)? ?${MONTH} (\\d{1,2})(?:st|nd|rd|th)?\\b`,
  ).exec(text);
  const said = dayFirst
    ? { cue: dayFirst[1], day: Number(dayFirst[2]), month: MONTHS[dayFirst[3]!]! }
    : monthFirst && monthFirst[2] !== 'may'
      ? { cue: monthFirst[1], day: Number(monthFirst[3]), month: MONTHS[monthFirst[2]!]! }
      : null;
  if (said) {
    if (said.cue === 'from') return null;
    const date = nextDay(today, said.month, said.day);
    if (!date) return null;
    return said.cue === 'before' ? addDays(date, -1) : date;
  }
  const monthAlone = new RegExp(
    `\\b(by|before|in|for|during) (?:the )?(?:start of |end of )?${MONTH}\\b`,
  ).exec(text);
  if (monthAlone) {
    const m = MONTHS[monthAlone[2]!]!;
    const y = yearOfMonth(today, m);
    if (monthAlone[1] === 'before') return addDays(iso(y, m, 1), -1);
    if (/\bstart of\b/.test(monthAlone[0])) return iso(y, m, 1);
    return lastDayOf(y, m);
  }
  return null;
}

/** When they enquired: "today", "this week", "since Monday 1 December", "before 20 November". */
function enquiryWindow(
  text: string,
  today: string,
): Pick<PeopleFilter, 'enquiredFrom' | 'enquiredBefore'> | null {
  if (/\btoday\b/.test(text)) return { enquiredFrom: today };
  if (/\byesterday\b/.test(text))
    return { enquiredFrom: addDays(today, -1), enquiredBefore: today };
  const last = new RegExp(`\\b(?:in )?the (?:last|past) ${NUMBER} (days?|weeks?)\\b`).exec(text);
  if (last) {
    const n = toNumber(last[1]!);
    return { enquiredFrom: addDays(today, -(last[2]!.startsWith('week') ? n * 7 : n)) };
  }
  if (/\b(?:this|the last|the past) week\b/.test(text)) return { enquiredFrom: addDays(today, -7) };
  const dated = new RegExp(
    `\\b(since|after|from|before|on) (?:the )?(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MONTH}\\b`,
  ).exec(text);
  if (dated) {
    // A date that hasn't come yet this year is last year's: enquiries are in the past.
    const [year] = today.split('-').map(Number) as [number];
    const month = MONTHS[dated[3]!]!;
    let date = iso(year, month, Number(dated[2]));
    if (date > today) date = iso(year - 1, month, Number(dated[2]));
    if (dated[1] === 'before') return { enquiredBefore: date };
    if (dated[1] === 'on') return { enquiredFrom: date, enquiredBefore: addDays(date, 1) };
    return { enquiredFrom: dated[1] === 'after' ? addDays(date, 1) : date };
  }
  return null;
}

function stayWanted(text: string): number | null {
  if (!/\b(?:stay\w*|lease|let|long[- ]?term|years?|months?)\b/.test(text)) return null;
  if (/\b(?:longer than|more than|over) (?:a|one|1) year\b/.test(text)) return 24;
  if (
    /\blong[- ]?term\b|\b(?:a|one|1) year or (?:longer|more)\b|\bat least (?:a|one) year\b/.test(
      text,
    )
  ) {
    return 12;
  }
  const months = new RegExp(`\\b${NUMBER} (?:months?|mths?)\\b`).exec(text);
  if (months) return toNumber(months[1]!);
  const years = new RegExp(`\\b${NUMBER} (?:years?|yrs?)\\b`).exec(text);
  if (years) return Math.min(toNumber(years[1]!) * 12, 60);
  if (/\b(?:a|one) year\b|\bthe year\b|\b12 months\b/.test(text)) return 12;
  return null;
}

function peopleWanted(text: string): number | null {
  const unit = '(?: (?:people|persons|adults|occupants|tenants|living there))?';
  const most = new RegExp(
    `\\b(?:up to|at most|no more than|max(?:imum)?(?: of)?|a max of|not more than) ${NUMBER}${unit}\\b`,
  ).exec(text);
  if (most) return toNumber(most[1]!);
  const orFewer = new RegExp(`\\b${NUMBER}${unit} or (?:fewer|less|under)\\b`).exec(text);
  if (orFewer) return toNumber(orFewer[1]!);
  const fewer = new RegExp(`\\b(?:fewer|less) than ${NUMBER}${unit}\\b`).exec(text);
  if (fewer) return Math.max(toNumber(fewer[1]!) - 1, 1);
  if (/\b(?:on their own|alone|by themselves|one person|1 person|just one)\b/.test(text)) return 1;
  const exactly = new RegExp(`\\b${NUMBER} (?:people|persons|adults|occupants)\\b`).exec(text);
  if (exactly) return toNumber(exactly[1]!);
  return null;
}

function petsWanted(text: string): 'none' | 'some' | null {
  if (
    /\b(?:no pets?|without (?:a |any )?pets?|pet[- ]free|(?:don't|doesn't|do not|does not|haven't|hasn't) (?:have |got )?(?:a |any )?pets?)\b/.test(
      text,
    )
  ) {
    return 'none';
  }
  if (/\b(?:pets?|pet owners?|dogs?|cats?)\b/.test(text)) return 'some';
  return null;
}

const ENQUIRY =
  /\b(?:enquir\w*|inquir\w*|got in touch|contacted|messaged|emailed|came in|arrived|new|latest|recent\w*)\b/;
const MOVE =
  /\b(?:move|moves|moving|move-in|movein|start|starting|in by|be in|get in|available|ready)\b/;

/**
 * UX-LP-15, UX-MT-18: reads an operator's question about the people on a letting. Returns a
 * filter on the four answers and the time of enquiry, or a decline. `today` is Irish.
 */
export function readPeopleQuestion(question: string, today: string): AskReading {
  const raw = question.slice(0, MAX_QUESTION + 1);
  if (raw.length > MAX_QUESTION) return { kind: 'declined', why: 'not_allowed' };
  const text = prepare(raw);
  // UX-AI-7, UX-MT-17: anything about who a person is, or asking Gaff to judge, is declined first.
  if (findProtectedGrounds(text).length > 0) return { kind: 'declined', why: 'not_allowed' };
  if (whoShouldApplyPhrase(text) !== null) return { kind: 'declined', why: 'not_allowed' };
  if (NOT_ALLOWED.some((pattern) => pattern.test(text))) {
    return { kind: 'declined', why: 'not_allowed' };
  }

  const filter: PeopleFilter = {};
  if (/\b(?:meets?|meeting|fits?|ticks?) (?:everything|all|every)\b/.test(text)) {
    filter.meetsAll = true;
  }
  if (
    /\b(?:hasn't|haven't|has not|have not|not yet|didn't|did not|yet to|never) (?:answered|answer|replied|reply)\b|\bnot answered\b|\bno answers?\b/.test(
      text,
    )
  ) {
    filter.answered = false;
  } else if (
    /\b(?:has|have|who've|who's|that) answered\b|\banswered (?:the )?questions\b/.test(text)
  ) {
    filter.answered = true;
  }
  if (ENQUIRY.test(text)) {
    const window = enquiryWindow(text, today);
    if (window) Object.assign(filter, window);
  } else if (MOVE.test(text) || /\b(?:before|by) (?:christmas|xmas|the new year)\b/.test(text)) {
    const by = lastDayAllowed(text, today);
    if (by && by >= today) filter.moveInBy = by;
  }
  const stay = stayWanted(text);
  if (stay && !filter.moveInBy) filter.stayAtLeast = stay;
  else if (stay && /\bstay\w*|lease|long[- ]?term\b/.test(text)) filter.stayAtLeast = stay;
  const most = peopleWanted(text);
  if (most) filter.peopleAtMost = Math.min(most, MAX_OCCUPANTS_ANSWER);
  const pets = petsWanted(text);
  if (pets) filter.pets = pets;

  const checked = peopleFilterSchema.safeParse(filter);
  if (!checked.success || isEmptyFilter(checked.data)) {
    return { kind: 'declined', why: 'not_understood' };
  }
  return { kind: 'filter', filter: checked.data };
}

/**
 * UX-AI-6, UX-AI-7: what the model may hand back for a question plain code couldn't read. It is
 * trusted for nothing: unknown keys fail it, and the result is a filter or nothing. The question
 * has had names and contact details taken out before the model sees it, and it has already
 * passed the checks above, so the model is never asked about who anyone is.
 */
export const questionReadingSchema = z.strictObject({
  filter: peopleFilterSchema.nullable(),
});

/** A model's reading as a filter, or null if it isn't a valid, non-empty one. */
export function checkQuestionReading(reading: unknown, today: string): PeopleFilter | null {
  const parsed = questionReadingSchema.safeParse(reading);
  if (!parsed.success || !parsed.data.filter || isEmptyFilter(parsed.data.filter)) return null;
  const filter = parsed.data.filter;
  // A move-in date that has passed, or an enquiry time still to come, can't be meant.
  if (filter.moveInBy && filter.moveInBy < today) return null;
  if (filter.enquiredFrom && filter.enquiredFrom > today) return null;
  return filter;
}
