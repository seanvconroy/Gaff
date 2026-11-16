import { describe, expect, it } from 'vitest';
import { appliedForThisLetting } from './conflict';

const ann = { email: 'Ann.Power@halcyon.test', emailVerified: true };

describe('UX-AC-14: a member can’t open a letting they have applied for as a renter', () => {
  it('a member whose own address enquired about the home is in conflict', () => {
    expect(appliedForThisLetting(ann, ['aoife.byrne@example.ie', 'ann.power@halcyon.test'])).toBe(
      true,
    );
  });

  it('capitals and spaces in the address make no difference', () => {
    expect(
      appliedForThisLetting({ ...ann, email: '  ANN.POWER@HALCYON.TEST ' }, [
        'ann.power@halcyon.test',
      ]),
    ).toBe(true);
  });

  it('a member who didn’t enquire about it is not', () => {
    expect(appliedForThisLetting(ann, ['aoife.byrne@example.ie'])).toBe(false);
    expect(appliedForThisLetting(ann, [])).toBe(false);
  });

  it('an address nobody verified proves nothing about who holds it', () => {
    expect(
      appliedForThisLetting({ ...ann, emailVerified: false }, ['ann.power@halcyon.test']),
    ).toBe(false);
  });

  it('a deleted applicant’s placeholder never matches anyone', () => {
    expect(appliedForThisLetting(ann, ['deleted-3f0e8a5c'])).toBe(false);
  });
});
