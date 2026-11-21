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
  title: 'Sign in or sign up',
  /** UX-AG-11: on the way to an invite. */
  joinTitle: (agencyName: string) => `Join ${agencyName}`,
  continueWith: (provider: SignInProvider) => `Continue with ${providerNames[provider]}`,
  or: 'or',
  emailLabel: 'Email',
  /** UX-SI-13: where a code can go by text as well: one field takes either. */
  identifierLabel: 'Email or mobile number',
  /** UX-SI-16: inside the field, at its start, once what's being typed is a number. */
  diallingCodeLabel: 'Country code',
  diallingCode: (name: string, code: string) => `${name} (+${code})`,
  continue: 'Continue',
  sending: 'Sending your code…',
  opening: (provider: SignInProvider) => `Opening ${providerNames[provider]}…`,
  /** UX-SI-6: which method was used last on this device. */
  lastUsed: (method: SignInMethod): string =>
    ({
      google: 'You used Google last time.',
      apple: 'You used Apple last time.',
      email_code: 'You used your email last time.',
      sms_code: 'You used your mobile number last time.',
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
    /** UX-SI-13: neither an email address nor a mobile number. */
    identifierInvalid: 'Enter an email address or a mobile number, like 087 123 4567',
    mobileInvalid: 'Enter a mobile number, like 087 123 4567',
    /** A real number, in a country Gaff doesn't text. */
    notTexted: 'We can’t text that country yet. Enter your email instead.',
    textNotSent:
      'We couldn’t send the text. Check the number and try again, or enter your email instead.',
    tooManyTexts:
      'We’ve sent a few codes to that number. Wait 10 minutes, then try again, or enter your email instead.',
    /** The hour's texts are used up (ADR-0033). Nothing about why. */
    textsPaused: 'We can’t send texts right now. Enter your email instead.',
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
  /** UX-SI-16: one line, where the code went: an email address, or a mobile number in full. */
  lead: (where: string) => `We sent a code to ${where}.`,
  /**
   * UX-SI-15: back from Google or Apple, which can't vouch for the address. The mailbox says
   * yes instead; the email itself says the provider is connected with the same code.
   */
  leadProvider: (email: string) => `We sent a code to ${email}, to check it’s yours.`,
  label: 'Six-digit code',
  checking: 'Checking…',
  /** States table: "Wrong code". */
  wrong: 'That code isn’t right. Check the email and try again.',
  wrongText: 'That code isn’t right. Check the text and try again.',
  /** States table: "Code expired or too many tries". */
  expired: 'That code has expired.',
  sendNew: 'Send a new code',
  sendNewIn: (seconds: number) =>
    `Send a new code in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`,
  sendingNew: 'Sending a new code…',
  sentNew: 'We’ve sent a new code. The old one no longer works.',
  different: 'Use a different email',
  differentNumber: 'Use a different number',
  devOutbox: 'Developing locally? The email is in the',
  devOutboxText: 'Developing locally? The text is in the',
} as const;

/**
 * UX-SI-14: a mobile number nobody has (or one that hasn't been used in 180 days) has just been
 * proved. One question: the email that goes with it. The same words whoever asks, so nobody
 * learns here whether an address has an account.
 */
export const emailNeededCopy = {
  title: 'What’s your email?',
  /** UX-SI-16: the one thing that keeps a person to one account. */
  lead: 'If you’ve used Gaff before, use the same one.',
  label: 'Email',
  continue: 'Continue',
  sending: 'Sending your code…',
  different: 'Use a different number',
} as const;

/**
 * UX-SI-14, UX-SI-15: "We've found your account". Shown once the mailbox has said yes, and never
 * before: signed in, with the account's email and what was just joined to it (UX-SI-16).
 */
export const foundCopy = {
  title: 'We’ve found your account',
  lead: 'You’re signed in.',
  /** For a screen reader, before each line of the account: its email, then what was joined. */
  emailRow: 'Email',
  joinedRow: (joined: Joined): string => (joined === 'mobile' ? 'Mobile' : 'Connected'),
  /** What was joined, as it's shown: the number with its middle hidden, or the provider's name. */
  joined: (joined: Joined, mobile: string | null): string =>
    joined === 'mobile' ? (mobile ?? '') : providerNames[joined],
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
  sentTo: (email: string) => `We sent a code to ${email}.`,
  /** The form couldn't go on because nobody has confirmed. Shown only if the sheet is closed. */
  needed: 'Confirm it’s you to save this.',
} as const;

function codeBlock(code: string): string[] {
  return ['', code, ''];
}

const lasts = `for the next ${CODE_LASTS_MINUTES} minutes`;

/** UX-SI-14, UX-SI-15: what the code also adds to the account, for the email to say plainly. */
export type CodeAdds = { mobileEnding: string } | { provider: SignInProvider };

/**
 * UX-SI-2, UX-SI-3: the sign-in email. One purpose, one button. The button signs the person in
 * on the device they started on; anywhere else it shows the code.
 *
 * UX-SI-14, UX-SI-15: when the code also joins a mobile number, or Google or Apple, to the
 * account, the email says so, and says not to share it: whoever enters it gets that way in.
 */
export function signInCodeEmail(code: string, link: string | null, adds: CodeAdds | null = null) {
  const added = !adds
    ? null
    : 'provider' in adds
      ? `When you do, ${providerNames[adds.provider]} is connected to your Gaff account, and you can sign in with it from then on.`
      : `When you do, the mobile number ending ${adds.mobileEnding} becomes a way to sign in to your Gaff account.`;
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

/**
 * UX-SI-13: the sign-in code by text. Plain characters only, and no apostrophes (a curly one
 * would make it two texts). The last line is the standard a phone reads to offer the code on
 * Gaff's own site and nowhere else.
 */
export function signInCodeText(code: string, host: string): string {
  return [
    `Your code to sign in to Gaff is ${code}. It works for ${CODE_LASTS_MINUTES} minutes. Never share it with anyone.`,
    '',
    `@${host} #${code}`,
  ].join('\n');
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
