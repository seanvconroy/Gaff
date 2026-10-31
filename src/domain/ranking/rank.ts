import type { RenterAnswers } from '@/domain/criteria/answers';
import type { Criteria } from '@/domain/criteria/criteria';
import { formatDate, formatDateTime } from '@/lib/format';

/**
 * R10 (ADR-0008): Gaff ranks enquirers against the operator's criteria, then by enquiry time,
 * and shows the reason for each position. Plain code, the same for everyone. Its only inputs
 * are the answers to the criteria questions and the enquiry time: never names, messages,
 * language or anything else. It suggests; a person decides who views (R11).
 */

export type CriterionKey = 'move_in' | 'stay' | 'occupants' | 'pets';
export type Result = 'met' | 'not_met' | 'unknown';

export interface Candidate {
  id: string;
  answers: RenterAnswers | null;
  answered: boolean;
  enquiredAt: Date;
}

export interface Ranked {
  id: string;
  position: number;
  met: number;
  total: number;
  answered: boolean;
  notMet: CriterionKey[];
  enquiredAt: Date;
}

export function evaluate(
  criteria: Criteria,
  answers: RenterAnswers | null,
): Array<{ key: CriterionKey; result: Result }> {
  const a = answers ?? {};
  const results: Array<{ key: CriterionKey; result: Result }> = [];
  if (criteria.moveInBy) {
    results.push({
      key: 'move_in',
      result:
        a.moveInDate === undefined
          ? 'unknown'
          : a.moveInDate <= criteria.moveInBy
            ? 'met'
            : 'not_met',
    });
  }
  if (criteria.minStayMonths) {
    results.push({
      key: 'stay',
      result:
        a.stayMonths === undefined
          ? 'unknown'
          : a.stayMonths >= criteria.minStayMonths
            ? 'met'
            : 'not_met',
    });
  }
  if (criteria.maxOccupants) {
    results.push({
      key: 'occupants',
      result:
        a.occupants === undefined
          ? 'unknown'
          : a.occupants <= criteria.maxOccupants
            ? 'met'
            : 'not_met',
    });
  }
  if (criteria.noPets) {
    results.push({
      key: 'pets',
      result: a.hasPets === undefined ? 'unknown' : a.hasPets ? 'not_met' : 'met',
    });
  }
  return results;
}

/** Answered first; then most criteria met; then earliest enquiry; then a stable tie-break. */
export function rank(criteria: Criteria, candidates: readonly Candidate[]): Ranked[] {
  const scored = candidates.map((candidate) => {
    const results = evaluate(criteria, candidate.answered ? candidate.answers : null);
    return {
      id: candidate.id,
      answered: candidate.answered || results.length === 0,
      met: results.filter((r) => r.result === 'met').length,
      total: results.length,
      notMet: results.filter((r) => r.result === 'not_met').map((r) => r.key),
      enquiredAt: candidate.enquiredAt,
    };
  });
  scored.sort(
    (x, y) =>
      Number(y.answered) - Number(x.answered) ||
      y.met - x.met ||
      x.enquiredAt.getTime() - y.enquiredAt.getTime() ||
      x.id.localeCompare(y.id),
  );
  return scored.map((s, i) => ({ ...s, position: i + 1 }));
}

const notMetWords = (criteria: Criteria): Record<CriterionKey, string> => ({
  move_in: criteria.moveInBy ? `can’t move in by ${formatDate(criteria.moveInBy)}` : 'move-in date',
  stay: 'plans a shorter stay',
  occupants: `more than ${criteria.maxOccupants} ${criteria.maxOccupants === 1 ? 'person' : 'people'}`,
  pets: 'has pets',
});

/** The reason for a position, in plain words. */
export function reasonFor(ranked: Ranked, criteria: Criteria, now: Date = new Date()): string {
  const enquired = `Enquired ${formatDateTime(ranked.enquiredAt, now)}.`;
  if (ranked.total === 0) return `No criteria set. ${enquired}`;
  if (!ranked.answered) return `Hasn’t answered the questions yet. ${enquired}`;
  if (ranked.met === ranked.total) {
    return `Meets ${ranked.total === 1 ? 'the criterion' : `all ${ranked.total} criteria`}. ${enquired}`;
  }
  const words = notMetWords(criteria);
  return `Meets ${ranked.met} of ${ranked.total} criteria (${ranked.notMet.map((k) => words[k]).join(', ')}). ${enquired}`;
}
