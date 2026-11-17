import type { RenterAnswers } from '@/domain/criteria/answers';
import { stayLabel } from '@/domain/criteria/answers';
import { type Criteria, criterionDetail, describeStay } from '@/domain/criteria/criteria';
import type { FilterKey, PeopleFilter } from '@/domain/fit/ask';
import {
  type CriterionCost,
  fitRows,
  mostCommonMiss,
  type PoolCounts,
  questionOf,
} from '@/domain/fit/fit';
import type { CriterionKey, Result } from '@/domain/ranking/rank';
import { formatDate } from '@/lib/format';

/**
 * The words of fit (section 6 of the UX redesign, UX-MT-6 to UX-MT-11, UX-LP-15, Q36): the
 * renter's answers beside the letting details, how a person fits what was asked, the pool
 * summary, and "Ask about who's enquired".
 *
 * Gaff never recommends a person (UX-MT-17). These words say who meets what was asked, a
 * criterion at a time, as a count with words ("Meets 3 of 4"): never a score, a percentage, a
 * star or a verdict. The pool summary names criteria and never people (UX-MT-7). A renter is
 * told what they said and what the home is for, without judgement, and nothing stops them
 * (UX-MT-11). The criteria are named in the letting details' own fixed words (UX-MT-3).
 */

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const people = (n: number) => count(n, 'person', 'people');
const lower = (words: string) => words.charAt(0).toLowerCase() + words.slice(1);

// --- The renter's side (UX-MT-11) -------------------------------------------------------

/**
 * UX-MT-11: on "Thanks", each answer beside what the home is for, in plain words and without
 * judgement: "You said: 4 people. This home is for up to 3." The same shape whether or not the
 * answer meets it, so nothing reads as a pass or a fail.
 */
export function answersBesideDetails(
  criteria: Criteria,
  answers: RenterAnswers | null,
  now: Date = new Date(),
): string[] {
  const a = answers ?? {};
  const lines: string[] = [];
  if (criteria.moveInBy && a.moveInDate !== undefined) {
    const said =
      a.moveInDate <= criteria.moveInBy
        ? `you could move in by ${formatDate(criteria.moveInBy, now)}`
        : `from ${formatDate(a.moveInDate, now)}`;
    lines.push(
      `You said: ${said}. This home is for moving in by ${formatDate(criteria.moveInBy, now)}.`,
    );
  }
  if (criteria.minStayMonths && a.stayMonths !== undefined) {
    lines.push(
      `You said: ${lower(stayLabel(a.stayMonths))}. This home is for ${describeStay(criteria.minStayMonths)} or longer.`,
    );
  }
  if (criteria.maxOccupants && a.occupants !== undefined) {
    lines.push(
      `You said: ${a.occupants === 1 ? 'just you' : `${a.occupants} people`}. This home is for up to ${criteria.maxOccupants}.`,
    );
  }
  if (criteria.noPets && a.hasPets !== undefined) {
    lines.push(
      `You said: ${a.hasPets ? 'you have pets' : 'no pets'}. This home doesn’t take pets. Assistance dogs are always welcome.`,
    );
  }
  return lines;
}

// --- One person (UX-MT-6) ---------------------------------------------------------------

const resultWords: Record<Result, string> = {
  met: 'Meets this',
  not_met: 'Doesn’t meet this',
  unknown: 'Not answered',
};

function saidWords(key: CriterionKey, answers: RenterAnswers, now: Date): string | null {
  switch (key) {
    case 'move_in':
      return answers.moveInDate !== undefined
        ? `Said by ${formatDate(answers.moveInDate, now)}`
        : null;
    case 'stay':
      return answers.stayMonths !== undefined
        ? `Said ${lower(stayLabel(answers.stayMonths))}`
        : null;
    case 'occupants':
      return answers.occupants !== undefined
        ? `Said ${answers.occupants === 1 ? 'just them' : `${answers.occupants} people`}`
        : null;
    case 'pets':
      return answers.hasPets !== undefined ? `Said ${answers.hasPets ? 'pets' : 'no pets'}` : null;
  }
}

/**
 * UX-MT-6, UX-LP-9: the detail behind "Meets 3 of 4", one tap away: each criterion in the
 * letting details' words, with their answer and whether it meets it.
 */
export function fitDetail(
  criteria: Criteria,
  answers: RenterAnswers | null,
  now: Date = new Date(),
): Array<{ label: string; value: string }> {
  return fitRows(criteria, answers).map((row) => {
    const said = saidWords(row.key, answers ?? {}, now);
    return {
      label: criterionDetail(criteria, questionOf[row.key], now),
      value: said ? `${said}. ${resultWords[row.result]}.` : `${resultWords[row.result]}.`,
    };
  });
}

// --- The pool (UX-MT-7, UX-MT-9) --------------------------------------------------------

const criterionNames: Record<CriterionKey, string> = {
  move_in: 'the move-in date',
  stay: 'the length of stay',
  occupants: 'the number of people',
  pets: 'pets',
};

function missWords(criteria: Criteria, key: CriterionKey, n: number, now: Date): string {
  switch (key) {
    case 'move_in':
      return `${n} ${n === 1 ? 'needs' : 'need'} later than ${formatDate(criteria.moveInBy!, now)}`;
    case 'stay':
      return `${n} ${n === 1 ? 'plans' : 'plan'} a shorter stay`;
    case 'occupants':
      return `${n} ${n === 1 ? 'is' : 'are'} more than ${people(criteria.maxOccupants!)}`;
    case 'pets':
      return `${n} ${n === 1 ? 'has' : 'have'} pets`;
  }
}

/**
 * UX-MT-7: the pool in one sentence, from counts of answers only: "Of 31 people who've answered,
 * 23 meet everything. The most common miss is the move-in date: 6 need later than Sunday 13
 * December." It names criteria and never people. Null when nothing was asked or nobody has
 * answered yet.
 */
export function poolSummary(
  criteria: Criteria,
  counts: PoolCounts,
  now: Date = new Date(),
): string | null {
  if (counts.costs.length === 0 || counts.answered === 0) return null;
  const meet = `${counts.meetEverything} ${counts.meetEverything === 1 ? 'meets' : 'meet'} everything`;
  const first = `Of ${people(counts.answered)} who’${counts.answered === 1 ? 's' : 've'} answered, ${meet}.`;
  const miss = mostCommonMiss(counts);
  if (!miss) return first;
  const most = counts.costs.length > 1 ? 'The most common miss is' : 'The one miss is';
  return `${first} ${most} ${criterionNames[miss.key]}: ${missWords(criteria, miss.key, miss.missing, now)}.`;
}

/**
 * UX-MT-9: what each criterion is costing, before invitations go out: how many miss it, and how
 * many more would meet everything without it. Counts only.
 */
export function criterionCost(
  criteria: Criteria,
  cost: CriterionCost,
  now: Date = new Date(),
): { label: string; value: string } {
  const label = criterionDetail(criteria, questionOf[cost.key], now);
  if (cost.missing === 0) return { label, value: 'Everyone who’s answered meets this.' };
  const without =
    cost.onlyThis === 0
      ? 'Without it, nobody more would meet everything.'
      : `Without it, ${cost.onlyThis} more would meet everything.`;
  const miss = missWords(criteria, cost.key, cost.missing, now);
  return { label, value: `${miss.charAt(0).toUpperCase()}${miss.slice(1)}. ${without}` };
}

export const poolCopy = {
  costs: 'What each one is costing you',
  change: 'Change letting details',
  changeNext:
    'A change applies to everyone the same way. Gaff ranks everyone again and records it in History.',
} as const;

// --- "Ask about who's enquired" (UX-LP-15) ----------------------------------------------

/** One chip's words for one part of a filter: "Can move in by Thursday 24 December". */
export function filterChipLabel(
  key: FilterKey,
  filter: PeopleFilter,
  now: Date = new Date(),
): string {
  switch (key) {
    case 'moveInBy':
      return `Can move in by ${formatDate(filter.moveInBy!, now)}`;
    case 'stayAtLeast':
      return `Staying ${describeStay(filter.stayAtLeast!)} or longer`;
    case 'peopleAtMost':
      return `Up to ${people(filter.peopleAtMost!)}`;
    case 'pets':
      return filter.pets === 'none' ? 'No pets' : 'Has pets';
    case 'meetsAll':
      return 'Meets everything you asked';
    case 'answered':
      return filter.answered ? 'Has answered' : 'Hasn’t answered yet';
    case 'enquiredFrom':
      return `Enquired since ${formatDate(filter.enquiredFrom!, now)}`;
    case 'enquiredBefore':
      return `Enquired before ${formatDate(filter.enquiredBefore!, now)}`;
  }
}

export const askCopy = {
  label: 'Ask about who’s enquired',
  hint: 'For example: Who can move in before Christmas?',
  button: 'Ask',
  asking: 'Asking…',
  /** UX-LP-15: the fixed words for anything else. They name nobody. */
  declined:
    'Gaff can sort people only by what you asked everyone: move-in date, length of stay, number of people and pets.',
  declinedNext: 'Tap one of these instead, or ask another way.',
  empty: 'Type a question about move-in dates, length of stay, number of people or pets.',
  chips: 'Their answers',
  clear: 'Clear',
  showing: (shown: number, all: number) =>
    `Showing ${shown} of ${all}. Everyone else is still here: clear the filter to see them.`,
} as const;
