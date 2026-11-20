import { describe, expect, it } from 'vitest';
import {
  chipsFor,
  chosenChip,
  peopleGroup,
  peopleIn,
  type PersonFacts,
  personHistory,
  standLine,
  statusWords,
} from './people';
import { stages } from './stages';

const now = new Date('2026-11-16T19:20:00Z');
const person = (over: Partial<PersonFacts>): PersonFacts => ({
  id: 'p',
  name: 'Aoife Byrne',
  status: 'enquired',
  met: 4,
  total: 4,
  answered: true,
  enquiredAt: new Date('2026-11-14T09:20:00Z'),
  answeredAt: new Date('2026-11-14T10:00:00Z'),
  booking: null,
  waitlistPosition: null,
  appliedAt: null,
  meetsIncomeRule: null,
  deleted: false,
  ...over,
});

const aoife = person({ id: 'a' });
const ciaran = person({ id: 'c', name: 'Ciarán Ó Súilleabháin', met: 3 });
const niamh = person({ id: 'n', name: 'Niamh Walsh', answered: false, answeredAt: null, met: 0 });

describe('UX-LP-8: one list of everyone who enquired, with chips for the stage', () => {
  it('UX-LP-8: the chips change with the stage, and the list opens on everyone', () => {
    expect(chipsFor[peopleGroup('enquiries')]).toEqual(['all', 'answered', 'not_yet']);
    expect(chipsFor[peopleGroup('viewings')]).toEqual(['all', 'invited', 'waitlist', 'others']);
    expect(chipsFor[peopleGroup('offer')]).toEqual(['all', 'applied', 'chosen', 'others']);
    for (const stage of stages) expect(chipsFor[peopleGroup(stage)][0]).toBe('all');
    expect(chosenChip(undefined, 'viewings')).toBe('all');
    expect(chosenChip('chosen', 'enquiries')).toBe('all');
  });

  it('UX-LP-8, UX-MT-8: a chip filters without moving anyone, and All hides nobody', () => {
    const people = [aoife, ciaran, niamh];
    expect(peopleIn(people, 'all', 'enquiries')).toEqual(people);
    expect(peopleIn(people, 'answered', 'enquiries').map((p) => p.id)).toEqual(['a', 'c']);
    expect(peopleIn(people, 'not_yet', 'enquiries').map((p) => p.id)).toEqual(['n']);
    const viewing = [
      person({ id: 'b', status: 'booked' }),
      person({ id: 'w', status: 'waitlisted' }),
      person({ id: 'e', status: 'enquired' }),
    ];
    // Every person is under exactly one chip besides All.
    for (const one of viewing) {
      const under = chipsFor.viewings.filter(
        (chip) => chip !== 'all' && peopleIn([one], chip, 'viewings').length === 1,
      );
      expect(under).toHaveLength(1);
    }
  });

  it('UX-LP-8, Q36: the one line is what was asked, never a score', () => {
    expect(standLine(ciaran, 'enquiries', now)).toBe('Meets 3 of 4');
    expect(standLine(niamh, 'enquiries', now)).toBe('Hasn’t answered the questions yet');
    expect(
      standLine(
        person({
          status: 'booked',
          booking: { startsAt: new Date('2026-11-20T18:00:00Z'), status: 'booked' },
        }),
        'viewings',
        now,
      ),
    ).toBe('Booked Friday 20 November, 6pm');
    expect(standLine(person({ status: 'waitlisted', waitlistPosition: 2 }), 'viewings', now)).toBe(
      'On the waiting list, 2nd',
    );
    expect(
      standLine(
        person({ status: 'applied', appliedAt: now, meetsIncomeRule: true }),
        'applications',
        now,
      ),
    ).toBe('Applied. Income meets your rule');
    for (const line of [standLine(ciaran, 'enquiries'), standLine(aoife, 'viewings')]) {
      expect(line).not.toMatch(/%|best|suit|recommend|score/i);
    }
  });

  it('UX-LP-8: no status is shown in danger', () => {
    for (const { tone } of Object.values(statusWords)) expect(tone).not.toBe('danger');
  });
});

describe('UX-LP-9: what’s happened with a person, from what their stage collected', () => {
  it('UX-LP-9: the steps they’ve been through, in order', () => {
    expect(
      personHistory(
        person({
          status: 'preferred',
          booking: { startsAt: new Date('2026-11-20T18:00:00Z'), status: 'attended' },
          appliedAt: new Date('2026-11-21T09:00:00Z'),
        }),
        now,
      ),
    ).toEqual([
      'Enquired Saturday 14 November, 9:20am',
      'Answered the questions Saturday 14 November, 10am',
      'Invited to view',
      'Booked a viewing for Friday 20 November, 6pm',
      'Came to view',
      'Applied Saturday 21 November, 9am',
      'Chosen as your preferred applicant',
    ]);
    expect(personHistory(niamh, now)).toEqual(['Enquired Saturday 14 November, 9:20am']);
  });
});
