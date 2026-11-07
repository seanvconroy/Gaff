import { describe, expect, it } from 'vitest';
import { groupsSharedAt, maySharePart } from './sharing';

describe('Rule 2, M11: a renter’s details reach a letter only at their stage', () => {
  it('shares only contact details and answers with an enquiry', () => {
    expect(groupsSharedAt('enquiry')).toEqual(['contact', 'answers']);
    expect(maySharePart('employment', 'enquiry')).toBe(false);
    expect(maySharePart('checks', 'enquiry')).toBe(false);
  });

  it('adds employment and income at the application, and checks only once chosen', () => {
    expect(maySharePart('employment', 'application')).toBe(true);
    expect(maySharePart('checks', 'application')).toBe(false);
    expect(maySharePart('checks', 'chosen')).toBe(true);
  });
});
