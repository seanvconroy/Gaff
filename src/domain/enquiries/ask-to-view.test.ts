import { describe, expect, it } from 'vitest';
import {
  ASK_WAIT_HOURS,
  QUESTION_MAX,
  answersFromSearch,
  askContactSchema,
  askPlan,
  askProblems,
  askQuestionSchema,
  carriedFilters,
  enquiryTime,
  stillWaiting,
  waitEndsAt,
} from './ask-to-view';

const at = (iso: string) => new Date(iso);
const all = ['moveInDate', 'stayMonths', 'occupants', 'hasPets'] as const;

describe('UX-AV-1, UX-AV-4: what asking to view collects', () => {
  it('UX-AV-1: a name and an email are enough', () => {
    expect(askContactSchema.parse({ fullName: ' Aoife Byrne ', email: 'aoife@example.ie ' })).toEqual(
      { fullName: 'Aoife Byrne', email: 'aoife@example.ie' },
    );
  });

  it('UX-AV-4: nothing else can be sent: a phone number, income or anything else is dropped', () => {
    const parsed = askContactSchema.parse({
      fullName: 'Aoife Byrne',
      email: 'aoife@example.ie',
      phone: '087 123 4567',
      monthlyIncome: '3,200',
      employer: 'Somewhere',
    });
    expect(Object.keys(parsed).sort()).toEqual(['email', 'fullName']);
  });

  it('UX-AV-1: says at the field what needs another look', () => {
    expect(askProblems({ fullName: '', email: 'not an email' }, ['fullName', 'email'])).toEqual({
      fullName: 'Enter your first and last name.',
      email: 'Enter an email address, like name@example.ie.',
    });
    expect(askProblems({ fullName: '', email: '' }, ['email'])).toEqual({
      email: 'Enter an email address, like name@example.ie.',
    });
  });

  it('UX-AV-5: the one free-text field is a question about the home, which may be left empty', () => {
    expect(askQuestionSchema.parse({ question: '  ' })).toEqual({ question: null });
    expect(askQuestionSchema.parse({})).toEqual({ question: null });
    expect(askQuestionSchema.parse({ question: ' Is there parking? ' })).toEqual({
      question: 'Is there parking?',
    });
    expect(askProblems({ question: 'x'.repeat(QUESTION_MAX + 1) }, ['question'])).toHaveProperty(
      'question',
    );
  });
});

describe('UX-AV-6: an enquiry from a typed email waits for its link', () => {
  it('UX-AV-6: is dropped 24 hours after Send, unconfirmed', () => {
    const sent = at('2026-11-17T10:00:00Z');
    expect(ASK_WAIT_HOURS).toBe(24);
    expect(waitEndsAt(sent)).toEqual(at('2026-11-18T10:00:00Z'));
    expect(stillWaiting(waitEndsAt(sent), at('2026-11-18T09:59:59Z'))).toBe(true);
    expect(stillWaiting(waitEndsAt(sent), at('2026-11-18T10:00:00Z'))).toBe(false);
  });

  it('UX-AV-6: its place in the order is the moment Send was pressed; an earlier enquiry’s stands', () => {
    const sent = at('2026-11-17T10:00:00Z');
    expect(enquiryTime(sent)).toEqual(sent);
    expect(enquiryTime(sent, at('2026-11-16T09:00:00Z'))).toEqual(at('2026-11-16T09:00:00Z'));
    expect(enquiryTime(sent, at('2026-11-17T11:00:00Z'))).toEqual(sent);
  });
});

describe('UX-AV-3: what the renter told search is carried in', () => {
  const now = at('2026-11-17T12:00:00Z');

  it('UX-AV-3: becomes answers to the questions the home asks, and only those', () => {
    const filters = { people: 2, pets: false, moveIn: '2027-01-01', stay: 'year' as const };
    expect(answersFromSearch(filters, all, now)).toEqual({
      occupants: 2,
      hasPets: false,
      moveInDate: '2027-01-01',
      stayMonths: 12,
    });
    expect(answersFromSearch(filters, ['occupants'], now)).toEqual({ occupants: 2 });
    expect(answersFromSearch(filters, [], now)).toEqual({});
  });

  it('UX-AV-3: a date the questions can’t take is left to be answered', () => {
    expect(answersFromSearch({ moveIn: '2026-11-01' }, all, now)).toEqual({});
    expect(answersFromSearch({ moveIn: '2028-06-01' }, all, now)).toEqual({});
  });

  it('UX-AV-3: only the four answers travel from search to a home: not where, rent or the home’s facts', () => {
    expect(
      carriedFilters({
        where: 'ranelagh',
        maxRent: 2000,
        beds: 2,
        people: 2,
        pets: true,
        moveIn: '2027-01-01',
        stay: 'longer',
        furnished: true,
        type: 'apartment',
      }),
    ).toEqual({ people: 2, pets: true, moveIn: '2027-01-01', stay: 'longer' });
  });
});

describe('Asking to view: which screens a renter sees', () => {
  it('UX-AV-1: someone signed out gives a name and an email, then answers each question', () => {
    expect(askPlan({ signedIn: null, asked: ['hasPets', 'occupants'], filled: {} })).toEqual({
      askName: true,
      askEmail: true,
      questions: ['occupants', 'hasPets'],
      known: [],
      check: false,
      twoTaps: false,
    });
  });

  it('UX-AV-3: an answer already known isn’t asked again, and "Is this right?" shows it', () => {
    const plan = askPlan({ signedIn: null, asked: all, filled: { occupants: 2 } });
    expect(plan.questions).toEqual(['hasPets', 'moveInDate', 'stayMonths']);
    expect(plan.known).toEqual(['occupants']);
    expect(plan.check).toBe(true);
    expect(plan.twoTaps).toBe(false);
  });

  it('UX-AV-2: someone signed in, with every answer kept, asks in two taps', () => {
    expect(
      askPlan({
        signedIn: { hasName: true },
        asked: ['occupants', 'hasPets'],
        filled: { occupants: 2, hasPets: false },
      }).twoTaps,
    ).toBe(true);
    expect(askPlan({ signedIn: { hasName: true }, asked: [], filled: {} }).twoTaps).toBe(true);
    expect(
      askPlan({ signedIn: { hasName: true }, asked: ['occupants'], filled: {} }).twoTaps,
    ).toBe(false);
    // A sign-in that gave no name asks for one, and nothing else about them.
    const nameless = askPlan({ signedIn: { hasName: false }, asked: [], filled: {} });
    expect([nameless.askName, nameless.askEmail, nameless.twoTaps]).toEqual([true, false, false]);
  });
});
