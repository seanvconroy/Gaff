import { describe, expect, it } from 'vitest';
import { isStaff, staffEmailsSchema } from './staff';

describe('UX-ME-2, UX-TS-5: who can see Gaff’s internal page', () => {
  it('UX-ME-2: nobody is staff by default', () => {
    expect(staffEmailsSchema.parse(undefined)).toEqual([]);
    expect(staffEmailsSchema.parse('')).toEqual([]);
    expect(isStaff({ email: 'ann@halcyon.test', emailVerified: true }, [])).toBe(false);
  });

  it('UX-ME-2: reads a comma-separated list, ignoring spaces and capitals', () => {
    expect(staffEmailsSchema.parse(' Founder@Gaff.test, second@gaff.test ,')).toEqual([
      'founder@gaff.test',
      'second@gaff.test',
    ]);
  });

  it('UX-ME-2: refuses a list that isn’t email addresses', () => {
    expect(staffEmailsSchema.safeParse('founder@gaff.test, everyone').success).toBe(false);
  });

  it('UX-ME-2: only a signed-in person with a verified, listed email is staff', () => {
    const staff = ['founder@gaff.test'];
    expect(isStaff({ email: 'Founder@gaff.test', emailVerified: true }, staff)).toBe(true);
    expect(isStaff({ email: 'founder@gaff.test', emailVerified: false }, staff)).toBe(false);
    expect(isStaff({ email: 'ann@halcyon.test', emailVerified: true }, staff)).toBe(false);
    expect(isStaff(null, staff)).toBe(false);
  });
});
