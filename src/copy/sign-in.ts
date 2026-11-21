import type { SensitiveAction } from '@/domain/auth/confirm';
import { CODE_LASTS_MINUTES } from '@/domain/auth/codes';
import type { Joined } from '@/domain/auth/joining';
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
  /** UX-AG-11: on the way to an invite. */
  joinTitle: (agencyName: string) => `Join ${agencyName}`,
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
    /**
     * AU4: the provider doesn't look after the address, so the mailbox has to say yes first.
     * The same words whether or not someone has the address: nobody learns who has an account.
     */
    notJoined: (provider: SignInProvider) =>
      `${providerNames[provider]} can’t confirm that email is still yours. This time, enter your email below for a code. Then you can connect ${providerNames[provider]} under “How you sign in” on your profile.`,
    /** AU4: the provider says it never checked the address. */
    notVerified: (provider: SignInProvider) =>
      `${providerNames[provider]} hasn’t confirmed that email address. Enter your email below for a code instead.`,
    /** AU12: too many tries from this network address. */
    slowDown: (seconds: number) =>
      `You’ve tried a few times from here. Try again ${inAWhile(seconds)}.`,
  },
} as const;

/** "in a minute", "in 5 minutes": how long until someone may try again, rounded up. */
export function inAWhile(seconds: number): string {
  if (seconds <= 60) return 'in a minute';
  return `in ${Math.ceil(seconds / 60)} minutes`;
}

/**
 * What the sign-in screen says when Google or Apple comes back without signing anyone in, by the
 * code in the address. A cancel isn't a problem, and says nothing (states table).
 */
export function providerProblemWords(
  error: string,
  provider: SignInProvider,
  waitSeconds: number,
): string {
  switch (error) {
    case 'account_not_linked':
    case 'confirm_email_first':
      return signInCopy.errors.notJoined(provider);
    case 'email_not_verified':
      return signInCopy.errors.notVerified(provider);
    case 'slow_down':
      return signInCopy.errors.slowDown(waitSeconds);
    default:
      return signInCopy.errors.provider(provider);
  }
}

export const codeCopy = {
  title: 'Enter your code',
  lead: (email: string) =>
    `We sent a six-digit code to ${email}. It works for the next ${CODE_LASTS_MINUTES} minutes.`,
  /**
   * UX-SI-15: back from Google or Apple, which can't vouch for the address. The mailbox says
   * yes instead, and the provider is connected with the same code.
   */
  leadProvider: (provider: SignInProvider, email: string) =>
    `${providerNames[provider]} can’t confirm ${email} is still yours, so we sent a six-digit code to it. Enter it and ${providerNames[provider]} is connected from then on. It works for the next ${CODE_LASTS_MINUTES} minutes.`,
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

/**
 * UX-SI-15: "We've found your account". Shown once the mailbox has said yes, and never
 * before: signed in, with what was just joined and where to change it.
 */
export const foundCopy = {
  title: 'We’ve found your account',
  signedInAs: (email: string) => `You’re signed in as ${email}.`,
  joined: (joined: Joined): string =>
    `${providerNames[joined]} is connected. You can sign in with it from now on.`,
  change: 'You can change this under “How you sign in” on your profile.',
  continue: 'Continue',
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

/** BA-8 (M5): Gaff's own team, opening /internal in production on another kind of sign-in. */
export const staffPasskeyCopy = {
  title: 'Sign in with your passkey',
  lead: 'Gaff’s own pages need a passkey sign-in from the last 8 hours. Use your passkey, and you go straight on to them.',
  use: 'Use your passkey',
  waiting: 'Waiting for your device…',
  failed: 'That didn’t work. Try again with your passkey.',
  /** On Profile, for someone on Gaff's team with no passkey yet. */
  needOne: 'Gaff’s own pages need a passkey. Add one below, then sign in with it to open them.',
} as const;

const actionWords: Record<SensitiveAction, string> = {
  change_payment_account: 'change the account tenants pay into',
  remove_member: 'remove someone from your agency',
  delete_agency: 'delete your agency',
  delete_profile: 'delete your profile',
  change_sign_in: 'change how you sign in',
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

/** UX-SI-15: what the code also adds to the account, for the email to say plainly. */
export interface CodeAdds {
  provider: SignInProvider;
}

/**
 * UX-SI-2, UX-SI-3: the sign-in email. One purpose, one button. The button signs the person in
 * on the device they started on; anywhere else it shows the code.
 *
 * UX-SI-15: when the code also joins Google or Apple to the account, the email says so, and
 * says not to share it: whoever enters it gets that way in.
 */
export function signInCodeEmail(code: string, link: string | null, adds: CodeAdds | null = null) {
  const added = adds
    ? `When you do, ${providerNames[adds.provider]} is connected to your Gaff account, and you can sign in with it from then on.`
    : null;
  return {
    subject: `${code} is your code to sign in to Gaff`,
    text: [
      'Hello,',
      '',
      'Your code to sign in to Gaff is:',
      ...codeBlock(code),
      'Enter it on the page where you started.',
      ...(added ? ['', added] : []),
      ...(link ? ['', 'Or sign in with one press, on the device you started on:', link] : []),
      '',
      added
        ? `The code works once, ${lasts}. If you didn’t ask for it, don’t share the code with anyone. Nothing changes without it.`
        : `The code works once, ${lasts}. If you didn’t ask for it, you can ignore this email.`,
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
