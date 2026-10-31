import { describe, expect, it } from 'vitest';
import { rank, reasonFor, type Candidate } from './rank';

const now = new Date('2026-11-05T12:00:00Z');
const criteria = { moveInBy: '2026-12-01', maxOccupants: 3, noPets: true };
const at = (iso: string) => new Date(iso);

function candidate(id: string, enquiredAt: string, answers: Candidate['answers']): Candidate {
  return { id, enquiredAt: at(enquiredAt), answers, answered: answers !== null };
}

describe('R10: ranking against the criteria, then by enquiry time (ADR-0008)', () => {
  const people = [
    candidate('late-all-met', '2026-11-04T10:00:00Z', {
      moveInDate: '2026-11-20',
      occupants: 2,
      hasPets: false,
    }),
    candidate('early-all-met', '2026-11-04T09:12:00Z', {
      moveInDate: '2026-12-01',
      occupants: 3,
      hasPets: false,
    }),
    candidate('pets', '2026-11-04T08:00:00Z', {
      moveInDate: '2026-11-15',
      occupants: 1,
      hasPets: true,
    }),
    candidate('not-answered', '2026-11-04T07:00:00Z', null),
    candidate('two-misses', '2026-11-04T06:00:00Z', {
      moveInDate: '2027-01-10',
      occupants: 5,
      hasPets: false,
    }),
  ];

  it('puts those meeting most criteria first, earliest enquiry first among equals', () => {
    expect(rank(criteria, people).map((r) => r.id)).toEqual([
      'early-all-met',
      'late-all-met',
      'pets',
      'two-misses',
      'not-answered',
    ]);
  });

  it('puts people who haven’t answered after everyone who has, in enquiry order (Q10)', () => {
    const ranked = rank(criteria, [
      candidate('b', '2026-11-04T09:00:00Z', null),
      candidate('a', '2026-11-04T08:00:00Z', null),
      candidate('answered-badly', '2026-11-04T10:00:00Z', {
        moveInDate: '2027-02-01',
        occupants: 9,
        hasPets: true,
      }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['answered-badly', 'a', 'b']);
  });

  it('ranks only by enquiry time when there are no criteria', () => {
    const ranked = rank({ noPets: false }, [
      candidate('second', '2026-11-04T09:00:00Z', null),
      candidate('first', '2026-11-04T08:00:00Z', null),
    ]);
    expect(ranked.map((r) => [r.id, r.position])).toEqual([
      ['first', 1],
      ['second', 2],
    ]);
  });

  it('gives the same result whatever order people arrive in', () => {
    const forwards = rank(criteria, people).map((r) => r.id);
    const backwards = rank(criteria, [...people].reverse()).map((r) => r.id);
    expect(backwards).toEqual(forwards);
  });

  it('explains every position in plain words', () => {
    const ranked = rank(criteria, people);
    expect(ranked.map((r) => reasonFor(r, criteria, now))).toEqual([
      'Meets all 3 criteria. Enquired Wednesday 4 November, 9:12am.',
      'Meets all 3 criteria. Enquired Wednesday 4 November, 10am.',
      'Meets 2 of 3 criteria (has pets). Enquired Wednesday 4 November, 8am.',
      'Meets 1 of 3 criteria (can’t move in by Tuesday 1 December, more than 3 people). Enquired Wednesday 4 November, 6am.',
      'Hasn’t answered the questions yet. Enquired Wednesday 4 November, 7am.',
    ]);
  });
});
