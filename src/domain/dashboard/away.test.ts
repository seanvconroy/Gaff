import { describe, expect, it } from 'vitest';
import { awayCountsIn, awaySentence, lastVisitEnded, sinceWords } from './away';

// Thursday 19 November 2026, 9:05am in Ireland.
const now = new Date('2026-11-19T09:05:00Z');
const at = (iso: string) => new Date(`${iso}:00Z`);
const none = { answered: 0, booked: 0, reminded: 0 };

describe('UX-HM-8: "While you were away" is one sentence built from counts only', () => {
  it('says what Gaff did since the last visit', () => {
    expect(
      awaySentence({ answered: 38, booked: 12, reminded: 0 }, at('2026-11-17T17:40'), now),
    ).toBe('Gaff answered 38 enquiries and booked 12 viewings since Tuesday.');
  });

  it('joins three things as a list, and agrees with the number', () => {
    expect(awaySentence({ answered: 1, booked: 1, reminded: 1 }, at('2026-11-18T16:00'), now)).toBe(
      'Gaff answered 1 enquiry, booked 1 viewing and sent 1 reminder since yesterday.',
    );
    expect(awaySentence({ ...none, reminded: 4 }, at('2026-11-19T08:00'), now)).toBe(
      'Gaff sent 4 reminders since 8am.',
    );
  });

  it('isn’t shown when Gaff did nothing since the last visit', () => {
    expect(awaySentence(none, at('2026-11-17T17:40'), now)).toBeNull();
  });

  it('isn’t shown on a first visit: there is nothing to be away from', () => {
    expect(awaySentence({ answered: 5, booked: 2, reminded: 0 }, null, now)).toBeNull();
  });

  it('is one sentence, with no name, address or link in it', () => {
    const sentence = awaySentence(
      { answered: 38, booked: 12, reminded: 3 },
      at('2026-11-02T10:00'),
      now,
    )!;
    expect(sentence).toBe(
      'Gaff answered 38 enquiries, booked 12 viewings and sent 3 reminders since 2 November.',
    );
    expect(sentence.match(/\./g)).toHaveLength(1);
    expect(sentence).not.toMatch(/@|https?:|\//);
  });
});

describe('since when, in words', () => {
  it('is a time today, "yesterday", a weekday this week, then a date', () => {
    expect(sinceWords(at('2026-11-19T07:15'), now)).toBe('since 7:15am');
    expect(sinceWords(at('2026-11-18T23:50'), now)).toBe('since yesterday');
    expect(sinceWords(at('2026-11-17T12:00'), now)).toBe('since Tuesday');
    expect(sinceWords(at('2026-11-13T12:00'), now)).toBe('since Friday');
    expect(sinceWords(at('2026-11-12T12:00'), now)).toBe('since 12 November');
  });

  it('goes by the day in Ireland, not in UTC', () => {
    // 11:30pm on 30 June in Ireland is 10:30pm UTC; half an hour later it is 1 July there.
    const summerNow = new Date('2026-07-01T08:00:00Z');
    expect(sinceWords(new Date('2026-06-30T22:30:00Z'), summerNow)).toBe('since yesterday');
    expect(sinceWords(new Date('2026-06-30T23:30:00Z'), summerNow)).toBe('since 12:30am');
  });
});

describe('when the last visit ended, from a person’s own active minutes', () => {
  it('is null when they have never been active before', () => {
    expect(lastVisitEnded([], now)).toBeNull();
  });

  it('is their newest minute, when they have just arrived', () => {
    expect(
      lastVisitEnded([at('2026-11-17T17:38'), at('2026-11-17T17:40'), at('2026-11-16T10:00')], now),
    ).toEqual(at('2026-11-17T17:40'));
  });

  it('looks past the visit going on now, however long it has run', () => {
    const thisVisit = [at('2026-11-19T09:04'), at('2026-11-19T09:03'), at('2026-11-19T08:40')];
    expect(lastVisitEnded([...thisVisit, at('2026-11-17T17:40')], now)).toEqual(
      at('2026-11-17T17:40'),
    );
    // Only this visit so far: no earlier one to count from.
    expect(lastVisitEnded(thisVisit, now)).toBeNull();
  });

  it('treats half an hour with nobody active as the end of a visit', () => {
    expect(lastVisitEnded([at('2026-11-19T08:36')], now)).toBeNull();
    expect(lastVisitEnded([at('2026-11-19T08:34')], now)).toEqual(at('2026-11-19T08:34'));
  });
});

describe('UX-HM-8: the counts are for the homes in view', () => {
  const byLetting = [
    { lettingId: 'mine', answered: 3, booked: 1, reminded: 0 },
    { lettingId: 'theirs', answered: 5, booked: 2, reminded: 4 },
    { lettingId: null, answered: 1, booked: 0, reminded: 0 },
  ];

  it('adds up every home for "Everyone"', () => {
    expect(awayCountsIn(byLetting, () => true)).toEqual({ answered: 9, booked: 3, reminded: 4 });
  });

  it('adds up only a person’s own homes for "Mine"', () => {
    expect(awayCountsIn(byLetting, (id) => id === 'mine')).toEqual({
      answered: 3,
      booked: 1,
      reminded: 0,
    });
    expect(awayCountsIn([], () => true)).toEqual({ answered: 0, booked: 0, reminded: 0 });
  });
});
