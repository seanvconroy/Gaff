import { CODE_MINUTES } from '@/domain/auth/codes';
import { formatDateTime } from '@/lib/format';

/**
 * Emails about a person's own Gaff account: codes, and news that the way they sign in has
 * changed (AU2, AU5, AU11). For renters, letters and staff alike. Plain, short, and what
 * happens next. The sign-in code itself is in renter-emails.ts.
 */

interface Email {
  subject: string;
  text: string;
}

const neverShare = 'Nobody from Gaff will ever ask you for this code.';

/** AU2: the code that finishes a new account made with a password. The code is the subject too. */
export function confirmEmailCodeEmail(code: string): Email {
  return {
    subject: `${code} is your code to finish setting up Gaff`,
    text: [
      'Hello,',
      '',
      `Your code is ${code}.`,
      '',
      `Type it where you created your account, and you’re in. It works for the next ${CODE_MINUTES} minutes. ${neverShare}`,
      '',
      'If you didn’t try to create a Gaff account, you can ignore this email: nothing is set up without the code.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** AU5: the code that lets someone choose a new password. */
export function resetCodeEmail(code: string): Email {
  return {
    subject: `${code} is your code to reset your Gaff password`,
    text: [
      'Hello,',
      '',
      `Your code is ${code}.`,
      '',
      `Type it where you asked to reset your password, then choose a new one. It works for the next ${CODE_MINUTES} minutes. ${neverShare}`,
      '',
      'If you didn’t ask to reset your password, you can ignore this email: your password stays as it is.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** AU4: someone tried to create an account with an email that already has one. */
export function accountExistsEmail(input: { signInUrl: string; resetUrl: string }): Email {
  return {
    subject: 'You already have a Gaff account',
    text: [
      'Hello,',
      '',
      'Someone, probably you, just tried to create a Gaff account with this email address. You already have one, so nothing has changed.',
      '',
      'Sign in here:',
      input.signInUrl,
      '',
      'If you’ve forgotten your password, or never had one, choose a new one here:',
      input.resetUrl,
      '',
      'If it wasn’t you, you can ignore this email. Nobody can get into your account without your password or a code sent to this address.',
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** AU11: a password was set, changed or reset. */
export function passwordChangedEmail(input: {
  how: 'set' | 'changed' | 'reset';
  at: Date;
  resetUrl: string;
}): Email {
  const what =
    input.how === 'set'
      ? 'A password was added to your Gaff account'
      : 'Your Gaff password was changed';
  return {
    subject: what,
    text: [
      'Hello,',
      '',
      `${what} on ${formatDateTime(input.at)}.${
        input.how === 'reset' ? ' Every device that was signed in has been signed out.' : ''
      }`,
      '',
      'If that was you, there’s nothing more to do.',
      '',
      'If it wasn’t, choose a new password now, which signs everyone else out:',
      input.resetUrl,
      '',
      'Gaff',
    ].join('\n'),
  };
}

const added = {
  google: 'Google was connected to your Gaff account',
  apple: 'Apple was connected to your Gaff account',
  passkey: 'A passkey was added to your Gaff account',
} as const;

/** AU11: a new way to sign in was added: Google, Apple or a passkey. */
export function methodAddedEmail(input: {
  method: keyof typeof added;
  at: Date;
  securityUrl: string;
}): Email {
  const what = added[input.method];
  return {
    subject: what,
    text: [
      'Hello,',
      '',
      `${what} on ${formatDateTime(input.at)}, so it can now be used to sign in.`,
      '',
      'If that was you, there’s nothing more to do.',
      '',
      'If it wasn’t, sign in, remove it under “How you sign in”, and choose a new password:',
      input.securityUrl,
      '',
      'Gaff',
    ].join('\n'),
  };
}
