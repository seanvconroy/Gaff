import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  firstListingNeedsReview,
  isChecked,
  mayAttempt,
  renterIdentity,
} from './access';
import { fullName, nameMatch, normaliseName } from './names';

describe('P22: names that differ for ordinary reasons still match', () => {
  it.each([
    [{ first: 'Niamh', last: 'Kelly' }, 'Niamh Kelly'],
    [{ first: 'NIAMH', last: 'KELLY' }, 'niamh kelly'],
    [{ first: 'Siobhán', last: 'Ní Bhriain' }, 'Siobhan Ni Bhriain'],
    [{ first: 'Seán', last: "O'Brien" }, 'Sean OBrien'],
    [{ first: 'Seán', last: 'Ó Briain' }, "Seán O'Briain"],
    [{ first: 'Ciarán', last: 'MacCarthy' }, 'Ciaran McCarthy'],
    [{ first: 'Aoife', last: 'Byrne' }, 'Aoife Mary Byrne'],
    [{ first: 'Aoife Mary', last: 'Byrne' }, 'Aoife Byrne'],
    [{ first: 'Tomás', last: 'Ruiz-García' }, 'Tomas Ruiz Garcia'],
  ])('%j and "%s"', (verified, used) => {
    expect(nameMatch(verified, used)).toBe('matches');
  });

  it.each([
    [{ first: 'Niamh', last: 'Kelly' }, "Niamh O'Kelly Smith"],
    [{ first: 'Niamh', last: 'Kelly' }, 'Aoife Kelly'],
    [{ first: 'Niamh', last: 'Kelly' }, 'Niamh Byrne'],
    [{ first: '', last: 'Kelly' }, 'Kelly'],
  ])('%j and "%s" differ, for a person to look at', (verified, used) => {
    expect(nameMatch(verified, used)).toBe('differs');
  });

  it('reads names without accents or punctuation', () => {
    expect(normaliseName('Seán Ó Briain-Kelly')).toEqual(['sean', 'obriain', 'kelly']);
    expect(fullName({ first: ' Niamh ', last: 'Kelly ' })).toBe('Niamh Kelly');
  });
});

describe('P15 to P29: what each identity status allows', () => {
  const record = (
    status: 'pending' | 'verified' | 'not_verified' | 'offline',
    selfie = true,
    attempts = 1,
  ) => ({
    status,
    selfie,
    attempts,
  });

  it('P29: someone checked is never asked again', () => {
    expect(isChecked(record('verified'))).toBe(true);
    expect(mayAttempt(record('verified'))).toBe(false);
  });

  it('P25: three attempts at most, then the other route', () => {
    expect(mayAttempt(null)).toBe(true);
    expect(mayAttempt(record('not_verified', true, MAX_ATTEMPTS - 1))).toBe(true);
    expect(mayAttempt(record('not_verified', true, MAX_ATTEMPTS))).toBe(false);
    expect(mayAttempt(record('offline'))).toBe(false);
  });

  it('P19, P20, P27: without a selfie, or offline, the letter sees the ID in person', () => {
    expect(renterIdentity(record('verified', true))).toBe('checked');
    expect(renterIdentity(record('verified', false))).toBe('in_person');
    expect(renterIdentity(record('offline'))).toBe('in_person');
    expect(renterIdentity(record('pending'))).toBe('started');
    expect(renterIdentity(null)).toBe('to_do');
  });

  it('P19: a letter checked without a selfie has their first listing reviewed', () => {
    expect(firstListingNeedsReview(record('verified', false))).toBe(true);
    expect(firstListingNeedsReview(record('verified', true))).toBe(false);
    expect(firstListingNeedsReview(null)).toBe(false);
  });

  it('P19, Q55: not when a person at Gaff saw their ID another way', () => {
    expect(firstListingNeedsReview({ ...record('verified', false), byPerson: true })).toBe(false);
  });
});
