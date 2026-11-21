import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { signInChangedEmail, signInRefusedEmail } from './account-emails';
import { layOutGaffEmail } from './email-layout';

const PROFILE = 'https://app.gaff.test/profile#profile-sign-in';
const when = 'Thursday 19 November, 6pm';

/**
 * BA-8 (AU11): the security emails about a person's own sign-in. New wording, listed for the
 * solicitor with the other fixed templates. These tests pin every word: a change here is a
 * decision, not a side effect.
 */
describe('AU11: a way in was added or removed', () => {
  it('AU11: Google connected, word for word', () => {
    const email = signInChangedEmail({
      change: 'added',
      method: 'google',
      when,
      profileUrl: PROFILE,
    });
    expect(email.subject).toBe('Google was connected to your Gaff account');
    expect(email.button).toBe('See how you sign in');
    expect(email.text).toBe(
      [
        'Hello,',
        '',
        'Google was connected to your Gaff account on Thursday 19 November, 6pm.',
        '',
        'If that was you, there’s nothing to do.',
        '',
        'If it wasn’t, sign in to Gaff with a code from your email and open your profile. Under “How you sign in” you can remove anything you don’t recognise, and sign out every other device.',
        '',
        PROFILE,
        '',
        'Gaff',
      ].join('\n'),
    );
  });

  it('AU11: each of the others, by its subject and its first line', () => {
    const cases = [
      ['added', 'apple', 'Apple was connected to your Gaff account'],
      ['added', 'passkey', 'A passkey was added to your Gaff account'],
      ['removed', 'google', 'Google was disconnected from your Gaff account'],
      ['removed', 'apple', 'Apple was disconnected from your Gaff account'],
      ['removed', 'passkey', 'A passkey was removed from your Gaff account'],
    ] as const;
    for (const [change, method, subject] of cases) {
      const email = signInChangedEmail({ change, method, when, profileUrl: PROFILE });
      expect(email.subject).toBe(subject);
      expect(email.text.split('\n')[2]).toBe(`${subject} on ${when}.`);
    }
  });
});

describe('AU4, AU11: someone tried to sign in with the person’s address', () => {
  it('AU11: word for word, to the address’s owner', () => {
    const email = signInRefusedEmail({ provider: 'google', when, profileUrl: PROFILE });
    expect(email.subject).toBe('Someone tried to sign in to Gaff with your email');
    expect(email.button).toBe('See how you sign in');
    expect(email.text).toBe(
      [
        'Hello,',
        '',
        'On Thursday 19 November, 6pm, someone tried to sign in to Gaff with Google, using this email address. We didn’t let them in, because Google doesn’t look after this address.',
        '',
        'If that was you, sign in with a code from your email instead. Then connect Google under “How you sign in” on your profile, and you can use it from then on.',
        '',
        PROFILE,
        '',
        'If it wasn’t you, there’s nothing to do. Nothing has changed on your account.',
        '',
        'Gaff',
      ].join('\n'),
    );
  });
});

describe('Voice: the security emails', () => {
  const all = [
    ...(['added', 'removed'] as const).flatMap((change) =>
      (['google', 'apple', 'passkey'] as const).map((method) =>
        signInChangedEmail({ change, method, when, profileUrl: PROFILE }),
      ),
    ),
    signInRefusedEmail({ provider: 'apple', when, profileUrl: PROFILE }),
  ];

  it('says what happened, when, what to do if it wasn’t them, and has one button', () => {
    for (const email of all) {
      expect(email.text).toContain(when);
      expect(email.text).toMatch(/If (it wasn’t|that was) you/);
      expect(email.text.match(/https?:\/\/\S+/g)).toEqual([PROFILE]);
      expect(
        layOutGaffEmail({ ...email, body: email.text, appUrl: 'https://app.gaff.test' }).html,
      ).toContain('See how you sign in');
    }
  });

  it('has no exclamation marks, no password, no jargon, and no protected ground', () => {
    for (const email of all) {
      for (const words of [email.subject, email.text]) {
        expect(words).not.toContain('!');
        expect(words).not.toMatch(/password|credential|token|authenticat|session|OTP/i);
        expect(findProtectedGrounds(words)).toEqual([]);
        expect(words).not.toMatch(/\w'\w/);
      }
    }
  });
});
