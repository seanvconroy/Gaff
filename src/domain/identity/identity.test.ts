import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, identityStage, isChecked, mayAttempt } from './access';
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

describe('P15 to P29, Q60: one identity check, with a live selfie', () => {
  const record = (
    status: 'pending' | 'verified' | 'not_verified' | 'offline',
    selfie = true,
    attempts = 1,
  ) => ({
    status,
    selfie,
    attempts,
  });

  it('P17, Q60: checked means a photo ID and a live selfie', () => {
    expect(isChecked(record('verified', true))).toBe(true);
    expect(isChecked(record('verified', false))).toBe(false);
    expect(isChecked(record('offline'))).toBe(false);
    expect(isChecked(null)).toBe(false);
  });

  it('P29: someone checked is never asked again', () => {
    expect(mayAttempt(record('verified', true))).toBe(false);
    expect(identityStage(record('verified', true))).toBe('checked');
  });

  it('P25: three attempts at most, until a person at Gaff gives more', () => {
    expect(mayAttempt(null)).toBe(true);
    expect(mayAttempt(record('not_verified', true, MAX_ATTEMPTS - 1))).toBe(true);
    expect(mayAttempt(record('not_verified', true, MAX_ATTEMPTS))).toBe(false);
    expect(identityStage(record('not_verified', true, MAX_ATTEMPTS))).toBe('no_tries_left');
    expect(identityStage(record('pending', true, 1))).toBe('started');
    expect(identityStage(null)).toBe('to_do');
  });

  it('Q60: a check recorded without a selfie, or offline, is done again with one', () => {
    expect(identityStage(record('verified', false, 1))).toBe('to_do');
    expect(identityStage(record('offline', false, 0))).toBe('to_do');
    expect(mayAttempt(record('verified', false, 1))).toBe(true);
  });
});
