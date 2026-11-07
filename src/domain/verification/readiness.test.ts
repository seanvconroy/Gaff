import { describe, expect, it } from 'vitest';
import { badgeWords, missingChecks, type CheckRecord } from './readiness';

const ok = (method: CheckRecord['method']): CheckRecord => ({
  method,
  status: 'passed',
  checkedAt: new Date('2026-11-03T10:00:00Z'),
  licenceNumber: method === 'psra_register' ? '001234' : null,
});

describe('M22: nothing goes live until the letter is checked', () => {
  it('a private landlord needs their mobile and their identity', () => {
    expect(missingChecks({ kind: 'landlord', organisation: [], member: [] })).toEqual([
      'mobile',
      'identity',
    ]);
    expect(
      missingChecks({
        kind: 'landlord',
        organisation: [],
        member: [ok('mobile'), ok('id_document')],
      }),
    ).toEqual([]);
  });

  it('an agency needs its licence, and the agent’s mobile and licence', () => {
    expect(missingChecks({ kind: 'agency', organisation: [], member: [ok('mobile')] })).toEqual([
      'agency_licence',
      'agent_licence',
    ]);
    expect(
      missingChecks({
        kind: 'agency',
        organisation: [ok('psra_register')],
        member: [ok('mobile'), ok('psra_register')],
      }),
    ).toEqual([]);
  });

  it('a pending or failed check doesn’t count', () => {
    expect(
      missingChecks({
        kind: 'landlord',
        organisation: [],
        member: [ok('mobile'), { method: 'id_document', status: 'needs_review' }],
      }),
    ).toEqual(['identity']);
  });
});

describe('M26: badges say what was checked and when', () => {
  const now = new Date('2026-11-07T10:00:00Z');
  it('describes passed checks', () => {
    expect(badgeWords(ok('id_document'), now)).toBe('Identity checked by Gaff on 3 November');
    expect(badgeWords(ok('psra_register'), now)).toBe(
      'PSRA licence 001234, checked on the public register on 3 November',
    );
  });

  it('shows no badge for anything else', () => {
    expect(badgeWords(ok('mobile'), now)).toBeNull();
    expect(badgeWords({ method: 'id_document', status: 'pending' }, now)).toBeNull();
  });
});
