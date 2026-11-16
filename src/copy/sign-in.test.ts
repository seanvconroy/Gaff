import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { sensitiveActions } from '@/domain/auth/confirm';
import { signInMethods } from '@/domain/auth/methods';
import {
  codeCopy,
  codeShownCopy,
  confirmCodeEmail,
  confirmCopy,
  linkCodeEmail,
  passkeyCopy,
  signInCodeEmail,
  signInCopy,
} from './sign-in';

/** Every sentence sign-in can show or send, however it's made. */
function everySentence(): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk({
    ...signInCopy,
    continueWith: [signInCopy.continueWith('google'), signInCopy.continueWith('apple')],
    opening: [signInCopy.opening('google'), signInCopy.opening('apple')],
    lastUsed: signInMethods.map(signInCopy.lastUsed),
    errors: {
      ...signInCopy.errors,
      provider: [signInCopy.errors.provider('google'), signInCopy.errors.provider('apple')],
    },
  });
  walk({
    ...codeCopy,
    lead: codeCopy.lead('ann@example.ie'),
    sendNewIn: [codeCopy.sendNewIn(1), codeCopy.sendNewIn(18)],
  });
  walk({ ...codeShownCopy, until: codeShownCopy.until('6:42pm') });
  walk({
    ...passkeyCopy,
    description: (['apple', 'android', 'windows', 'other'] as const).map(passkeyCopy.description),
  });
  walk({
    ...confirmCopy,
    why: sensitiveActions.map(confirmCopy.why),
    sentTo: confirmCopy.sentTo('ann@example.ie'),
  });
  for (const email of [
    signInCodeEmail('123456', 'https://app.gaff.test/sign-in/open?t=abc'),
    signInCodeEmail('123456', null),
    ...sensitiveActions.map((action) => confirmCodeEmail('123456', action)),
    linkCodeEmail('123456', { address: '12 Ranelagh Road', operatorName: 'Halcyon Lettings' }),
  ]) {
    out.push(email.subject, email.text);
  }
  return out;
}

describe('UX-SI-1: the sign-in screen’s words', () => {
  it('has the title and the buttons section 2 gives', () => {
    expect(signInCopy.title).toBe('Sign in or create an account');
    expect(signInCopy.continueWith('google')).toBe('Continue with Google');
    expect(signInCopy.continueWith('apple')).toBe('Continue with Apple');
    expect(signInCopy.or).toBe('or');
    expect(signInCopy.continue).toBe('Continue');
  });

  it('UX-SI-6: says which method was used last, and names nobody', () => {
    expect(signInCopy.lastUsed('google')).toBe('You used Google last time.');
    expect(signInCopy.lastUsed('apple')).toBe('You used Apple last time.');
    expect(signInCopy.lastUsed('email_code')).toBe('You used your email last time.');
    expect(signInCopy.lastUsed('passkey')).toBe('You used a passkey last time.');
  });

  it('UX-SI-7: carries no description of Gaff and no tagline', () => {
    for (const sentence of everySentence()) {
      expect(sentence).not.toMatch(/runs the letting|from the first enquiry|signed tenancy/i);
      expect(sentence).not.toMatch(/welcome to gaff|the easy way|lettings, /i);
    }
  });

  it('UX-SI-8: never tells anyone there is no account, or asks for a password', () => {
    for (const sentence of everySentence()) {
      expect(sentence).not.toMatch(/no account|not found|don’t have an account|sign up|password/i);
    }
  });
});

describe('UX-SI states: the exact words of section 2’s states table', () => {
  it('wrong code', () => {
    expect(codeCopy.wrong).toBe('That code isn’t right. Check the email and try again.');
  });

  it('code expired or too many tries', () => {
    expect(codeCopy.expired).toBe('That code has expired.');
    expect(codeCopy.sendNew).toBe('Send a new code');
  });

  it('email didn’t send', () => {
    expect(signInCopy.errors.notSent).toBe(
      'We couldn’t send the code. Check the address and try again.',
    );
  });

  it('UX-SI-2: the code screen’s two ways on', () => {
    expect(codeCopy.sendNewIn(18)).toBe('Send a new code in 18 seconds');
    expect(codeCopy.sendNewIn(1)).toBe('Send a new code in 1 second');
    expect(codeCopy.different).toBe('Use a different email');
  });
});

describe('UX-SI-4: the passkey offer', () => {
  it('uses the device’s own wording', () => {
    expect(passkeyCopy.title).toBe('Sign in faster next time');
    expect(passkeyCopy.notNow).toBe('Not now');
    expect(passkeyCopy.description('apple')).toBe(
      'Use Face ID or Touch ID instead of a code from your email.',
    );
    expect(passkeyCopy.description('android')).toContain('your fingerprint or face');
    expect(passkeyCopy.description('windows')).toContain('Windows Hello');
    expect(passkeyCopy.description('other')).toContain('your device’s screen lock');
  });
});

describe('UX-SI-2, UX-SI-3: the sign-in email', () => {
  const link = 'https://app.gaff.test/sign-in/open?t=abc';
  const { subject, text } = signInCodeEmail('042917', link);

  it('has one purpose: the code, with one button', () => {
    expect(subject).toBe('042917 is your code to sign in to Gaff');
    expect(text).toContain('Your code to sign in to Gaff is:\n\n042917\n');
    expect(text.match(/https?:\/\/\S+/g)).toEqual([link]);
    expect(text).toContain('Or sign in with one press, on the device you started on:');
  });

  it('ends with what happens next, and when', () => {
    expect(text).toContain(
      'The code works once, for the next 10 minutes. If you didn’t ask for it, you can ignore this email.',
    );
    expect(text.trimEnd().endsWith('Gaff')).toBe(true);
  });

  it('names nobody and carries no address: it is the same for everyone', () => {
    expect(text).not.toContain('@');
    expect(subject).not.toContain('@');
  });
});

describe('UX-SI-10, UX-SI-12: the other two code emails', () => {
  it('says what the person asked to do, and has no button to press', () => {
    const { subject, text } = confirmCodeEmail('042917', 'change_payment_account');
    expect(subject).toBe('042917 is your code to confirm it’s you');
    expect(text).toContain('You asked to change the account tenants pay into, in Gaff.');
    expect(text).toContain('Nothing changes without it.');
    expect(text).not.toMatch(/https?:\/\//);
  });

  it('names the home by its address, and is signed by the operator', () => {
    const { subject, text } = linkCodeEmail('042917', {
      address: '12 Ranelagh Road',
      operatorName: 'Halcyon Lettings',
    });
    expect(subject).toBe('042917 is your code for 12 Ranelagh Road');
    expect(text.trimEnd().endsWith('Halcyon Lettings')).toBe(true);
    expect(text).not.toMatch(/https?:\/\//);
  });
});

describe('Voice: every word of sign-in', () => {
  it('uses no exclamation marks, no blame and no jargon', () => {
    for (const sentence of everySentence()) {
      expect(sentence, sentence).not.toContain('!');
      expect(sentence, sentence).not.toMatch(
        /\b(invalid|illegal|failed|error|authenticat|credential|OTP|token|verif|session)\w*/i,
      );
      expect(sentence, sentence).not.toMatch(/you (must|failed|entered the wrong)/i);
    }
  });

  it('touches no protected ground (rule 3)', () => {
    for (const sentence of everySentence()) {
      expect(findProtectedGrounds(sentence), sentence).toEqual([]);
    }
  });

  it('uses typographic apostrophes, as the rest of Gaff does', () => {
    for (const sentence of everySentence()) {
      expect(sentence, sentence).not.toMatch(/\w'\w/);
    }
  });
});
