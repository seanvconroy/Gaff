import { homeWordingProblem } from '@/domain/compliance/who-should-apply';
import type { Fact } from '@/domain/answers/guardrails';
import { formatDate } from '@/lib/format';
import type { DraftAnswers, Patch } from './add-letting';
import { stripPersonalDetails } from './advert-reading';
import { furnishing, MAX_DESCRIPTION, parkingOptions, propertyTypes } from './new-letting';

/**
 * P10, P11 (the live line's M45): a home's description drafted by the AI from the home's facts
 * and the lister's own statements about it. The rules here say what the model is given, and
 * when what it gives back may be used. Nothing about any person, ever.
 */

const labelOf = <T extends Record<string, string>>(labels: T, key: string | undefined) =>
  key && key in labels ? labels[key as keyof T] : null;

/**
 * P10: the facts a drafted description may use. The home's own facts, the area by name, and
 * the lister's own statements about it, with names and contact details taken out (rule 7).
 * Never the rent, the criteria or the house rule (renters see those apart, in Gaff's fixed
 * words), never the street, the house number or the Eircode, and nothing about a renter.
 * `names` are the lister's and their organisation's, for taking out of their statements.
 */
export function descriptionFacts(
  answers: DraftAnswers,
  names: readonly string[] = [],
  now: Date = new Date(),
): Fact[] {
  const type = labelOf(propertyTypes, answers.propertyType);
  const facts: Array<Fact | null> = [
    type && answers.propertyType !== 'other' ? { id: 'home:type', text: `Type: ${type}` } : null,
    answers.area
      ? {
          id: 'home:area',
          text: `Area: ${[answers.area, answers.county].filter(Boolean).join(', ')}`,
        }
      : null,
    answers.bedrooms === undefined
      ? null
      : {
          id: 'home:bedrooms',
          text: answers.bedrooms === 0 ? 'Bedrooms: none, a studio' : `Bedrooms: ${answers.bedrooms}`,
        },
    answers.bathrooms === undefined
      ? null
      : { id: 'home:bathrooms', text: `Bathrooms: ${answers.bathrooms}` },
    labelOf(furnishing, answers.furnished)
      ? { id: 'home:furnished', text: `Furnishing: ${labelOf(furnishing, answers.furnished)}` }
      : null,
    answers.berRating
      ? {
          id: 'home:ber',
          text: `BER: ${answers.berRating === 'exempt' ? 'Exempt' : answers.berRating}`,
        }
      : null,
    labelOf(parkingOptions, answers.parking)
      ? { id: 'home:parking', text: `Parking: ${labelOf(parkingOptions, answers.parking)}` }
      : null,
    answers.availableFrom
      ? { id: 'home:available', text: `Available from ${formatDate(answers.availableFrom, now)}` }
      : null,
  ];
  const own = (answers.otherFacts ?? [])
    .map((statement) => stripPersonalDetails(statement, names).trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `own:${index + 1}`, text }));
  return [...facts.filter((fact): fact is Fact => fact !== null), ...own];
}

/** P10: a draft needs at least the type of home or its bedrooms to say what the home is. */
export function canDraftFrom(answers: DraftAnswers): boolean {
  return Boolean(answers.propertyType) || answers.bedrooms !== undefined;
}

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
};

/** Every number in a text, as digits: "two bedrooms, 48 m²" gives 2 and 48. */
export function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\d+(?:[.,]\d+)?/g)) found.add(match[0].replace(',', '.'));
  for (const match of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const digit = NUMBER_WORDS[match[0]];
    if (digit) found.add(digit);
  }
  return found;
}

export const descriptionProblems = [
  'too_short',
  'too_long',
  'wording',
  'contact_details',
  'number_not_in_facts',
  'unknown_fact',
  'no_facts',
] as const;
export type DescriptionProblem = (typeof descriptionProblems)[number];

/** The shortest and longest drafts used. A field takes up to 4,000 characters of the lister's. */
export const DRAFT_MIN_CHARS = 200;
export const DRAFT_MAX_CHARS = 1500;

const CONTACT = /https?:\/\/|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\[(?:name|phone|email|link)\]/i;

/** A drafted text as the field keeps it: Unix line ends, no space at either end. */
export function tidyDescription(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

/**
 * P10, P11: a drafted description is used only if it is a sensible length, passes the checks a
 * description the lister writes must pass (rule 3: `homeWordingProblem`), has no contact
 * details, has no number the facts don't have (so it can't have made up a size, a distance or
 * a price), and cites only facts it was given, at least one. Otherwise it is never shown, and
 * the lister writes their own (P5).
 */
export function descriptionProblem(
  draft: { description: string; factIds: readonly string[] },
  facts: readonly Fact[],
): DescriptionProblem | null {
  const text = tidyDescription(draft.description);
  if (text.length < DRAFT_MIN_CHARS) return 'too_short';
  if (text.length > Math.min(DRAFT_MAX_CHARS, MAX_DESCRIPTION)) return 'too_long';
  if (homeWordingProblem(text) !== null) return 'wording';
  if (CONTACT.test(text)) return 'contact_details';
  const known = numbersIn(facts.map((fact) => fact.text).join(' '));
  for (const number of numbersIn(text)) {
    if (!known.has(number)) return 'number_not_in_facts';
  }
  const ids = new Set(facts.map((fact) => fact.id));
  if (draft.factIds.some((id) => !ids.has(id))) return 'unknown_fact';
  if (draft.factIds.length === 0) return 'no_facts';
  return null;
}

/**
 * P11: whether a saved description is still the AI's draft, for the "Drafted by AI" pill on the
 * lister's side. A save that leaves the description out keeps the mark as it was. A saved text
 * is the AI's if it is the draft Gaff gave (`drafted`, checked by the server), or if it was
 * already marked and its words haven't changed. Any change to the words makes them the
 * lister's. Renters never see the mark.
 */
export function withDescriptionMark(
  before: DraftAnswers,
  patch: Patch<DraftAnswers>,
  drafted: boolean,
): Patch<DraftAnswers> {
  if (!('description' in patch)) return patch;
  const text = patch.description;
  const unchanged = Boolean(before.descriptionByAi) && text === before.description;
  return { ...patch, descriptionByAi: text && (drafted || unchanged) ? true : undefined };
}
