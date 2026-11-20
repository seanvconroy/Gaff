import type { RenterAnswers } from '@/domain/criteria/answers';
import type { Criteria, CriterionQuestion } from '@/domain/criteria/criteria';
import { type CriterionKey, evaluate, type Result } from '@/domain/ranking/rank';

/**
 * Fit (section 6, UX-MT-6 to UX-MT-9, Q36): whether someone's answers meet what was asked, one
 * criterion at a time, and the same for a whole pool as counts. This reads the ranking's own
 * `evaluate`, so fit and the ranking can never disagree, and it changes nothing about the
 * ranking (UX-MT-2).
 *
 * Its only inputs are the four answers and the criteria: never a name, a message, or anything
 * about who a person is (rule 3). Its outputs are per-criterion results and counts: never a
 * score, a percentage or a verdict on a person (UX-MT-6, UX-MT-17). Nobody is hidden, removed or
 * rejected by anything here (UX-MT-8): it says what is true of answers, and a person decides.
 */

/** The ranking's names for the four criteria, against the questions that ask them. */
export const questionOf: Record<CriterionKey, CriterionQuestion> = {
  move_in: 'moveInDate',
  stay: 'stayMonths',
  occupants: 'occupants',
  pets: 'hasPets',
};

export interface FitRow {
  key: CriterionKey;
  result: Result;
}

/** UX-MT-6: each criterion asked, in the letting details' order, with whether the answer meets it. */
export function fitRows(criteria: Criteria, answers: RenterAnswers | null): FitRow[] {
  return evaluate(criteria, answers);
}

/** The pool as it bears on one criterion: how many miss it, and how many miss only it. */
export interface CriterionCost {
  key: CriterionKey;
  /** People who've answered and don't meet it. */
  missing: number;
  /** Of those, the people who meet everything else: it is all that stands between them and "meets everything". */
  onlyThis: number;
}

export interface PoolCounts {
  /** People who've answered the questions (withdrawn enquiries aren't counted). */
  answered: number;
  meetEverything: number;
  /** Every criterion asked, in the letting details' order. */
  costs: CriterionCost[];
}

export interface PoolMember {
  answers: RenterAnswers | null;
  answered: boolean;
}

/**
 * UX-MT-7, UX-MT-9: the pool as counts of criteria answers, and nothing else. The input holds no
 * name or ID, so nothing written from it can name a person.
 */
export function poolCounts(criteria: Criteria, pool: readonly PoolMember[]): PoolCounts {
  const answered = pool.filter((person) => person.answered);
  const results = answered.map((person) => fitRows(criteria, person.answers));
  const keys = fitRows(criteria, null).map((row) => row.key);
  return {
    answered: answered.length,
    meetEverything: results.filter((rows) => rows.every((row) => row.result === 'met')).length,
    costs: keys.map((key) => {
      const missing = results.filter((rows) =>
        rows.some((row) => row.key === key && row.result === 'not_met'),
      );
      return {
        key,
        missing: missing.length,
        onlyThis: missing.filter((rows) =>
          rows.every((row) => row.key === key || row.result === 'met'),
        ).length,
      };
    }),
  };
}

/** The criterion most people miss, or null if nobody misses any. A tie goes to the first asked. */
export function mostCommonMiss(counts: PoolCounts): CriterionCost | null {
  let most: CriterionCost | null = null;
  for (const cost of counts.costs) {
    if (cost.missing > 0 && (!most || cost.missing > most.missing)) most = cost;
  }
  return most;
}
