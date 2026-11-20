import { describe, expect, it } from 'vitest';
import { hostsThisEmail, joinRefusal, removalRefusal } from './email-authority';

describe('AU4: a provider vouches only for addresses it hosts', () => {
  it('Google hosts Gmail addresses', () => {
    expect(hostsThisEmail('google', { email: 'ann.power@gmail.com', emailVerified: true })).toBe(
      true,
    );
    expect(
      hostsThisEmail('google', { email: 'Ann.Power@GoogleMail.com', emailVerified: true }),
    ).toBe(true);
  });

  it('Google hosts a Workspace address, which carries its own domain as the hosted domain', () => {
    expect(
      hostsThisEmail('google', {
        email: 'ann@halcyon.test',
        emailVerified: true,
        hostedDomain: 'halcyon.test',
      }),
    ).toBe(true);
    // A Workspace account's hosted domain is no use for an address at another domain.
    expect(
      hostsThisEmail('google', {
        email: 'ann@elsewhere.test',
        emailVerified: true,
        hostedDomain: 'halcyon.test',
      }),
    ).toBe(false);
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
      hostsThisEmail('apple', { email: 'x7k2m9@privaterelay.appleid.com', emailVerified: true }),
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
});

describe('AU4: joining a Google or Apple sign-in to someone', () => {
  const gmail = { email: 'ann@gmail.com', emailVerified: true };
  const work = { email: 'ann@halcyon.test', emailVerified: true };
  const base = { provider: 'google' as const, connectingWhileSignedIn: false };

  it('joins or creates only where the provider hosts the address', () => {
    expect(joinRefusal({ ...base, claims: gmail, newPerson: true })).toBeNull();
    expect(joinRefusal({ ...base, claims: gmail, newPerson: false })).toBeNull();
  });

  it('asks a new person for a code first, and an existing one to sign in another way', () => {
    expect(joinRefusal({ ...base, claims: work, newPerson: true })).toBe('confirm_email_first');
    expect(joinRefusal({ ...base, claims: work, newPerson: false })).toBe('account_not_linked');
  });

  it('joins any verified address when the person is signed in and connects it themselves', () => {
    expect(
      joinRefusal({ ...base, claims: work, newPerson: false, connectingWhileSignedIn: true }),
    ).toBeNull();
  });

  it('never joins an address the provider says it never checked', () => {
    const unverified = { email: 'ann@gmail.com', emailVerified: false };
    expect(joinRefusal({ ...base, claims: unverified, newPerson: true })).toBe(
      'email_not_verified',
    );
    expect(
      joinRefusal({ ...base, claims: unverified, newPerson: false, connectingWhileSignedIn: true }),
    ).toBe('email_not_verified');
  });
});

describe('AU7: removing a way in', () => {
  const person = {
    email: 'ann@halcyon.test',
    emailVerified: true,
    providers: ['google', 'apple'] as const,
    passkeys: 1,
  };

  it('lets anything go while a code by email still reaches the person', () => {
    expect(removalRefusal({ ...person, remove: 'google' })).toBeNull();
    expect(removalRefusal({ ...person, remove: 'apple' })).toBeNull();
    expect(removalRefusal({ ...person, remove: 'passkey' })).toBeNull();
    expect(
      removalRefusal({ ...person, providers: ['google'], passkeys: 0, remove: 'google' }),
    ).toBeNull();
  });

  it('keeps Apple on an account whose address Apple made, because nobody knows it by heart', () => {
    const relay = { ...person, email: 'X7K2@PrivateRelay.AppleID.com' };
    expect(removalRefusal({ ...relay, remove: 'apple' })).toBe('hide_my_email');
    expect(removalRefusal({ ...relay, remove: 'google' })).toBeNull();
    expect(removalRefusal({ ...relay, remove: 'passkey' })).toBeNull();
  });

  it('never leaves someone with no way in', () => {
    const unproven = { ...person, emailVerified: false, providers: ['google'] as const };
    expect(removalRefusal({ ...unproven, passkeys: 0, remove: 'google' })).toBe('last_way_in');
    expect(removalRefusal({ ...unproven, passkeys: 1, remove: 'google' })).toBeNull();
    expect(removalRefusal({ ...unproven, providers: [], passkeys: 1, remove: 'passkey' })).toBe(
      'last_way_in',
    );
  });
});
