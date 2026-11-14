import { describe, expect, it } from 'vitest';
import { hostsThisEmail, isPrivateRelay } from './email-authority';

describe('AU4: a provider vouches only for addresses it hosts', () => {
  it('Google hosts Gmail addresses', () => {
    expect(hostsThisEmail('google', { email: 'ann.power@gmail.com', emailVerified: true })).toBe(
      true,
    );
    expect(
      hostsThisEmail('google', { email: 'Ann.Power@GoogleMail.com', emailVerified: true }),
    ).toBe(true);
  });

  it('Google hosts a Workspace address, which carries its hosted domain', () => {
    expect(
      hostsThisEmail('google', {
        email: 'ann@halcyon.test',
        emailVerified: true,
        hostedDomain: 'halcyon.test',
      }),
    ).toBe(true);
  });

  it('Google does not host an address it only checked once', () => {
    // A Google account made with a work address that Microsoft, say, hosts.
    expect(hostsThisEmail('google', { email: 'ann@halcyon.test', emailVerified: true })).toBe(
      false,
    );
    expect(
      hostsThisEmail('google', {
        email: 'ann@halcyon.test',
        emailVerified: true,
        hostedDomain: '',
      }),
    ).toBe(false);
  });

  it('nobody vouches for an address they say is unverified', () => {
    expect(hostsThisEmail('google', { email: 'ann@gmail.com', emailVerified: false })).toBe(false);
    expect(hostsThisEmail('apple', { email: 'ann@icloud.com', emailVerified: 'false' })).toBe(
      false,
    );
  });

  it('Apple hosts iCloud addresses and its own relay, and says "true" as a word', () => {
    for (const email of ['ann@icloud.com', 'ann@me.com', 'ann@mac.com']) {
      expect(hostsThisEmail('apple', { email, emailVerified: 'true' })).toBe(true);
    }
    expect(
      hostsThisEmail('apple', {
        email: 'x7k2m9@privaterelay.appleid.com',
        emailVerified: true,
      }),
    ).toBe(true);
  });

  it('Apple does not host a Gmail or work address used as an Apple ID', () => {
    expect(hostsThisEmail('apple', { email: 'ann@gmail.com', emailVerified: 'true' })).toBe(false);
    expect(hostsThisEmail('apple', { email: 'ann@halcyon.test', emailVerified: true })).toBe(false);
  });

  it('a look-alike domain is not the real one', () => {
    expect(
      hostsThisEmail('google', { email: 'ann@gmail.com.evil.test', emailVerified: true }),
    ).toBe(false);
    expect(hostsThisEmail('google', { email: 'ann@notgmail.com', emailVerified: true })).toBe(
      false,
    );
    expect(hostsThisEmail('google', { email: 'gmail.com', emailVerified: true })).toBe(false);
    expect(hostsThisEmail('google', { emailVerified: true })).toBe(false);
  });

  it('knows a Hide My Email address', () => {
    expect(isPrivateRelay('x7k2m9@privaterelay.appleid.com')).toBe(true);
    expect(isPrivateRelay('ann@icloud.com')).toBe(false);
  });
});
