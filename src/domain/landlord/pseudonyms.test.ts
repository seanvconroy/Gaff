import { describe, expect, it } from 'vitest';
import { applicantLabels, landlordNumbers } from './pseudonyms';

describe('R27 and Q4: what the landlord sees about renters', () => {
  it('names renters only as "Applicant 1", "Applicant 2"… in enquiry order', () => {
    const labels = applicantLabels(['c', 'a', 'b']);
    expect([...labels.entries()]).toEqual([
      ['c', 'Applicant 1'],
      ['a', 'Applicant 2'],
      ['b', 'Applicant 3'],
    ]);
  });

  it('counts where everyone is, without saying who', () => {
    expect(
      landlordNumbers([
        { status: 'enquired', answered: false },
        { status: 'enquired', answered: true },
        { status: 'invited', answered: true },
        { status: 'booked', answered: true },
        { status: 'attended', answered: true },
        { status: 'no_show', answered: true },
        { status: 'waitlisted', answered: true },
        { status: 'not_invited', answered: false },
        { status: 'withdrawn', answered: false },
        { status: 'applied', answered: true },
        { status: 'preferred', answered: true },
      ]),
    ).toEqual({
      enquiries: 11,
      answered: 8,
      invited: 6,
      waitlisted: 1,
      booked: 5,
      came: 3,
      didNotCome: 1,
      applied: 2,
    });
  });
});
