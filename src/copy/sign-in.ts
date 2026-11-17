import type { SensitiveAction } from '@/domain/auth/confirm';
import { CODE_LASTS_MINUTES } from '@/domain/auth/codes';
import type { SignInMethod, SignInProvider } from '@/domain/auth/methods';
import type { DeviceKind } from '@/domain/auth/passkey-offer';

/**
 * Every word of sign-in (section 2 of the UX redesign): the screens, the states and the emails.
 * Plain, warm Irish English. No tagline and no description of Gaff anywhere (UX-SI-7). The
 * states use the exact words of section 2's states table.
 */

const providerNames: Record<SignInProvider, string> = { google: 'Google', apple: 'Apple' };

export const signInCopy = {
  title: 'Sign in or create an account',
  continueWith: (provider: SignInProvider) => `Continue with ${providerNames[provider]}`,
  or: 'or',
  emailLabel: 'Email',
  continue: 'Continue',
  sending: 'Sending your code…',
  opening: (provider: SignInProvider) => `Opening ${providerNames[provider]}…`,
  /** UX-SI-6: which method was used last on this device. */
  lastUsed: (method: SignInMethod): string =>
    ({
      google: 'You used Google last time.',
      apple: 'You used Apple last time.',
      email_code: 'You used your email last time.',
      passkey: 'You used a passkey last time.',
    })[method],
  smallPrint: {
    before: 'By continuing, you agree to Gaff’s ',
    terms: 'terms',
    between: ' and ',
    privacy: 'privacy notice',
    after: '.',
  },
  errors: {
    emailInvalid: 'Enter an email address, like ann@example.ie',
    /** States table: "Email didn't send". */
    notSent: 'We couldn’t send the code. Check the address and try again.',
    tooMany: 'We’ve sent a few codes to that address. Wait 10 minutes, then try again.',
    /** Google or Apple answered with something other than a cancel. */
    provider: (provider: SignInProvider) =>
      `We couldn’t sign you in with ${providerNames[provider]}. Try again, or use your email.`,
  },
} as const;

export const codeCopy = {
  title: 'Enter your code',
  lead: (email: string) =>
    `We sent a six-digit code to ${email}. It works for the next ${CODE_LASTS_MINUTES} minutes.`,
  label: 'Six-digit code',
  checking: 'Checking…',
  /** States table: "Wrong code". */
  wrong: 'That code isn’t right. Check the email and try again.',
  /** States table: "Code expired or too many tries". */
  expired: 'That code has expired.',
  sendNew: 'Send a new code',
  sendNewIn: (seconds: number) =>
    `Send a new code in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`,
  sendingNew: 'Sending a new code…',
  sentNew: 'We’ve sent a new code. The old one no longer works.',
  different: 'Use a different email',
  devOutbox: 'Developing locally? The email is in the',
} as const;

/** UX-SI-3: the email's button, opened somewhere other than where the person started. */
export const codeShownCopy = {
  title: 'Your code',
  lead: 'Enter this code on the device where you started signing in.',
  until: (time: string) => `It works until ${time}.`,
  goneTitle: 'That button has expired',
  gone: 'Go back to where you started and choose “Send a new code”, or start again here.',
  startAgain: 'Sign in',
} as const;

const unlockWords: Record<DeviceKind, string> = {
  apple: 'Face ID or Touch ID',
  android: 'your fingerprint or face',
  windows: 'Windows Hello',
  other: 'your device’s screen lock',
};

/** UX-SI-4: the passkey offer, in the device's own words. */
export const passkeyCopy = {
  signedIn: 'You’re signed in',
  title: 'Sign in faster next time',
  description: (device: DeviceKind) =>
    `Use ${unlockWords[device]} instead of a code from your email.`,
  turnOn: 'Turn it on',
  turningOn: 'Waiting for your device…',
  notNow: 'Not now',
  failed: 'That didn’t work. Try again, or choose “Not now”.',
  continue: 'Continue',
} as const;

const actionWords: Record<SensitiveAction, string> = {
  change_payment_account: 'change the account tenants pay into',
  remove_member: 'remove someone from your agency',
  delete_agency: 'delete your agency',
  delete_profile: 'delete your profile',
};

/** UX-SI-10: confirming it's you again, before a sensitive action. */
export const confirmCopy = {
  title: 'Confirm it’s you',
  why: (action: SensitiveAction) => `Before you ${actionWords[action]}, we check it’s really you.`,
  usePasskey: 'Use your passkey',
  waitingForPasskey: 'Waiting for your device…',
  passkeyFailed: 'That didn’t work. Try again, or use a code from your email.',
  emailCode: 'Email me a code',
  emailCodeInstead: 'Email me a code instead',
  sending: 'Sending your code…',
  sentTo: (email: string) =>
    `We sent a six-digit code to ${email}. It works for the next ${CODE_LASTS_MINUTES} minutes.`,
  /** The form couldn't go on because nobody has confirmed. Shown only if the sheet is closed. */
  needed: 'Confirm it’s you to save this.',
} as const;

function codeBlock(code: string): string[] {
  return ['', code, ''];
}

const lasts = `for the next ${CODE_LASTS_MINUTES} minutes`;

/**
 * UX-SI-2, UX-SI-3: the sign-in email. One purpose, one button. The button signs the person in
 * on the device they started on; anywhere else it shows the code.
 */
export function signInCodeEmail(code: string, link: string | null) {
  return {
    subject: `${code} is your code to sign in to Gaff`,
    text: [
      'Hello,',
      '',
      'Your code to sign in to Gaff is:',
      ...codeBlock(code),
      'Enter it on the page where you started.',
      ...(link ? ['', 'Or sign in with one press, on the device you started on:', link] : []),
      '',
      `The code works once, ${lasts}. If you didn’t ask for it, you can ignore this email.`,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/** UX-SI-10: the code that confirms it's you, before a sensitive action. No button. */
export function confirmCodeEmail(code: string, action: SensitiveAction) {
  return {
    subject: `${code} is your code to confirm it’s you`,
    text: [
      'Hello,',
      '',
      `You asked to ${actionWords[action]}, in Gaff. To confirm it’s you, enter this code:`,
      ...codeBlock(code),
      `It works once, ${lasts}. If you didn’t ask for this, don’t share the code with anyone. Nothing changes without it.`,
      '',
      'Gaff',
    ].join('\n'),
  };
}

/**
 * UX-SI-12: the code for a private link's sensitive page (check results, bank details), sent to
 * the email on that application. Ready for the renter's pages to use; not sent anywhere yet.
 */
export function linkCodeEmail(code: string, input: { address: string; operatorName: string }) {
  return {
    subject: `${code} is your code for ${input.address}`,
    text: [
      'Hello,',
      '',
      `To open your page about ${input.address}, enter this code:`,
      ...codeBlock(code),
      `It works once, ${lasts}. If you didn’t ask for it, you can ignore this email.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}
