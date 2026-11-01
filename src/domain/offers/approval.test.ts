import { describe, expect, it } from 'vitest';
import { approvalAnswersSchema, approvalRoute } from './approval';

describe('R19: who approves, and how (Q22)', () => {
  it('a landlord letting their own homes approves by making the offer', () => {
    expect(approvalRoute({ organisationKind: 'landlord', landlordEmail: null })).toBe('own_home');
  });

  it('an agency sends the landlord a private link, or confirms their approval itself', () => {
    expect(approvalRoute({ organisationKind: 'agency', landlordEmail: 'owner@example.ie' })).toBe(
      'link',
    );
    expect(approvalRoute({ organisationKind: 'agency', landlordEmail: null })).toBe(
      'operator_confirms',
    );
  });
});

describe('R19: the landlord’s answer', () => {
  it('needs an answer for each person on the summary', () => {
    expect(approvalAnswersSchema(true).safeParse({ preferred: 'approve' }).success).toBe(false);
    expect(approvalAnswersSchema(true).parse({ preferred: 'approve', backup: 'decline' })).toEqual({
      preferred: 'approved',
      backup: 'declined',
    });
    expect(approvalAnswersSchema(false).parse({ preferred: 'decline' })).toEqual({
      preferred: 'declined',
      backup: null,
    });
  });
});
