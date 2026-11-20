import { describe, expect, it } from 'vitest';
import {
  approvalAnswersSchema,
  approvalRoute,
  approvalScreen,
  checksStillUnderWay,
} from './approval';

describe('UX-OP-6: one person per screen', () => {
  const both = ['preferred', 'backup'] as const;

  it('UX-OP-6: opens on the chosen tenant, then the backup once the tenant has an answer', () => {
    expect(approvalScreen(both, {})).toBe(0);
    expect(approvalScreen(both, { preferred: 'approve' })).toBe(1);
    expect(approvalScreen(both, { preferred: 'decline' })).toBe(1);
    expect(approvalScreen(['preferred'], {})).toBe(0);
  });

  it('UX-OP-6: never opens the backup’s screen before the tenant has an answer', () => {
    expect(approvalScreen(both, {}, 'backup')).toBe(0);
    expect(approvalScreen(both, { preferred: 'approve' }, 'backup')).toBe(1);
  });

  it('UX-OP-6: Back returns to the tenant’s screen, with nothing lost', () => {
    expect(approvalScreen(both, { preferred: 'approve' }, 'preferred')).toBe(0);
    expect(approvalScreen(both, { preferred: 'approve' }, 'nobody')).toBe(1);
  });
});

describe('R19: who approves, and how (Q22)', () => {
  it('a landlord letting their own homes approves by making the offer', () => {
    expect(approvalRoute({ organisationKind: 'landlord', landlordEmail: null })).toBe('own_home');
    // UX-AC-4: a private landlord's silent organisation is theirs alone: there's no owner to ask.
    expect(approvalRoute({ organisationKind: 'private_landlord', landlordEmail: null })).toBe(
      'own_home',
    );
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

describe('UX-OP-7: checks still under way', () => {
  it('UX-OP-7: counts the checks that aren’t back, so the agent is warned before asking', () => {
    expect(
      checksStillUnderWay([
        { status: 'passed' },
        { status: 'in_progress' },
        { status: 'to_do' },
        { status: 'no_answer' },
        { status: 'not_needed' },
        { status: 'answered' },
        { status: 'not_passed' },
      ]),
    ).toBe(2);
    expect(checksStillUnderWay([])).toBe(0);
  });
});
