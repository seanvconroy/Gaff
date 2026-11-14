import { describe, expect, it } from 'vitest';
import { invitationIsFor } from './invitation';

describe('AU9, M16: an invitation is for the person it was sent to', () => {
  it('is for someone signed in with the invited email, however it’s capitalised', () => {
    expect(
      invitationIsFor('liam@halcyon.test', { email: 'liam@halcyon.test', emailVerified: true }),
    ).toBe(true);
    expect(
      invitationIsFor(' Liam@Halcyon.test', { email: 'liam@halcyon.test', emailVerified: true }),
    ).toBe(true);
  });

  it('isn’t for someone else who was forwarded the link', () => {
    expect(
      invitationIsFor('liam@halcyon.test', { email: 'bob@elsewhere.test', emailVerified: true }),
    ).toBe(false);
  });

  it('isn’t for an email nobody has confirmed', () => {
    expect(
      invitationIsFor('liam@halcyon.test', { email: 'liam@halcyon.test', emailVerified: false }),
    ).toBe(false);
  });

  it('isn’t for anyone once its email has been cleared', () => {
    expect(invitationIsFor(null, { email: 'liam@halcyon.test', emailVerified: true })).toBe(false);
  });
});
