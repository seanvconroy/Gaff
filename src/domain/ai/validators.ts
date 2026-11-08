import type { Fact } from '@/domain/answers/guardrails';
import { checkListingText } from '@/domain/moderation/listing-text';

/**
 * ADR-0025: checks on what the model returns, beyond its schema, against the product rules. A
 * reply that fails is never used: the task falls back to people (P5).
 */

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

export type DescriptionProblem =
  'too_short' | 'too_long' | 'listing_text' | 'unknown_fact' | 'number_not_in_facts';

/**
 * M45, P10: a drafted description is used only if it's a sensible length, passes the same checks
 * as the letter's own words (M46), cites only facts it was given, and has no number the facts
 * don't have, so it can't have made up a size, a distance or a price.
 */
export function descriptionProblem(
  draft: { description: string; factIds: string[] },
  facts: readonly Fact[],
): DescriptionProblem | null {
  const text = draft.description.trim();
  if (text.length < 200) return 'too_short';
  if (text.length > 1500) return 'too_long';
  if (checkListingText(text).length > 0) return 'listing_text';
  const ids = new Set(facts.map((f) => f.id));
  if (draft.factIds.some((id) => !ids.has(id))) return 'unknown_fact';
  const known = numbersIn(facts.map((f) => f.text).join(' '));
  for (const number of numbersIn(text)) {
    if (!known.has(number)) return 'number_not_in_facts';
  }
  return null;
}

/**
 * ADR-0023, P13: a wording finding counts only if its phrase is copied word for word from the
 * text. The ground is already one of the fixed list (the schema). Duplicates are dropped.
 */
export function confirmedFindings<F extends { phrase: string }>(
  findings: readonly F[],
  text: string,
): F[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const phrase = finding.phrase.trim();
    if (phrase.length === 0 || phrase.length > 200 || !text.includes(phrase)) return false;
    if (seen.has(phrase.toLowerCase())) return false;
    seen.add(phrase.toLowerCase());
    return true;
  });
}
