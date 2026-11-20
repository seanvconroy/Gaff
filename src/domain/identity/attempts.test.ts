import { describe, expect, it } from 'vitest';
import {
  ID_CHECK_NOTICE_VERSION,
  MAX_ATTEMPTS,
  REDACT_AFTER_DAYS,
  attemptsLeft,
  mayAttempt,
  redactAfter,
} from './attempts';
import { fullName } from './names';

describe('P25: three tries at an ID check', () => {
  it('P25: three tries at most; never again once it has passed', () => {
    expect(MAX_ATTEMPTS).toBe(3);
    expect(mayAttempt(null)).toBe(true);
    expect(mayAttempt({ attempts: MAX_ATTEMPTS - 1, passed: false })).toBe(true);
    expect(mayAttempt({ attempts: MAX_ATTEMPTS, passed: false })).toBe(false);
    expect(mayAttempt({ attempts: 1, passed: true })).toBe(false);
    expect(attemptsLeft({ attempts: 2, passed: false })).toBe(1);
    expect(attemptsLeft({ attempts: 5, passed: false })).toBe(0);
  });

  it('P25: the seam for more tries from Gaff’s team is the one parameter', () => {
    expect(mayAttempt({ attempts: MAX_ATTEMPTS, passed: false }, 2)).toBe(true);
    expect(mayAttempt({ attempts: MAX_ATTEMPTS, passed: true }, 2)).toBe(false);
  });
});

describe('P26: the provider deletes what it holds, 30 days after the result', () => {
  it('P26: the deletion date is 30 days on', () => {
    expect(REDACT_AFTER_DAYS).toBe(30);
    expect(redactAfter(new Date('2026-11-19T10:00:00Z')).toISOString()).toBe(
      '2026-12-19T10:00:00.000Z',
    );
  });

  it('P18: the words shown before a check have a version, recorded when it starts', () => {
    expect(ID_CHECK_NOTICE_VERSION).toMatch(/^id_check_notice_v\d+$/);
  });
});

describe('P21: the verified name as one line', () => {
  it('P21: first and last, trimmed and joined', () => {
    expect(fullName({ first: ' Niamh ', last: 'Kelly ' })).toBe('Niamh Kelly');
    expect(fullName({ first: 'Siobhán', last: 'Ní  Bhriain' })).toBe('Siobhán Ní Bhriain');
  });
});
