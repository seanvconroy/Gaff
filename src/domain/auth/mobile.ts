/**
 * UX-SI-13: a mobile number as a way in, by a six-digit code sent by text (Q61, ADR-0033).
 *
 * The rules here are pure: which numbers Gaff texts, how one is read from what a person typed,
 * how long a number still vouches for its owner, and how it's shown. Sending and storing are in
 * src/server/auth.
 *
 * A dialling code says where a SIM was sold and nothing about the person (rule 3). It is never
 * shown to anyone who lets a home, never used to rank, and never read as anything else.
 */

export interface DiallingCode {
  /** ISO 3166 code: the value the form sends. */
  iso: string;
  name: string;
  /** The country's calling code, without the plus. */
  code: string;
}

/**
 * The countries Gaff texts a sign-in code to. A fixed list, Ireland first: a text costs money,
 * and a list keeps anyone from using Gaff to run up texts to numbers that pay them for each one.
 * Everyone else signs in with their email, Google or Apple.
 */
export const diallingCodes: readonly DiallingCode[] = [
  { iso: 'IE', name: 'Ireland', code: '353' },
  { iso: 'GB', name: 'United Kingdom', code: '44' },
  { iso: 'AU', name: 'Australia', code: '61' },
  { iso: 'AT', name: 'Austria', code: '43' },
  { iso: 'BE', name: 'Belgium', code: '32' },
  { iso: 'BR', name: 'Brazil', code: '55' },
  { iso: 'BG', name: 'Bulgaria', code: '359' },
  { iso: 'CA', name: 'Canada', code: '1' },
  { iso: 'HR', name: 'Croatia', code: '385' },
  { iso: 'CY', name: 'Cyprus', code: '357' },
  { iso: 'CZ', name: 'Czechia', code: '420' },
  { iso: 'DK', name: 'Denmark', code: '45' },
  { iso: 'EE', name: 'Estonia', code: '372' },
  { iso: 'FI', name: 'Finland', code: '358' },
  { iso: 'FR', name: 'France', code: '33' },
  { iso: 'DE', name: 'Germany', code: '49' },
  { iso: 'GR', name: 'Greece', code: '30' },
  { iso: 'HU', name: 'Hungary', code: '36' },
  { iso: 'IS', name: 'Iceland', code: '354' },
  { iso: 'IN', name: 'India', code: '91' },
  { iso: 'IT', name: 'Italy', code: '39' },
  { iso: 'LV', name: 'Latvia', code: '371' },
  { iso: 'LT', name: 'Lithuania', code: '370' },
  { iso: 'LU', name: 'Luxembourg', code: '352' },
  { iso: 'MT', name: 'Malta', code: '356' },
  { iso: 'NL', name: 'Netherlands', code: '31' },
  { iso: 'NZ', name: 'New Zealand', code: '64' },
  { iso: 'NO', name: 'Norway', code: '47' },
  { iso: 'PL', name: 'Poland', code: '48' },
  { iso: 'PT', name: 'Portugal', code: '351' },
  { iso: 'RO', name: 'Romania', code: '40' },
  { iso: 'SK', name: 'Slovakia', code: '421' },
  { iso: 'SI', name: 'Slovenia', code: '386' },
  { iso: 'ZA', name: 'South Africa', code: '27' },
  { iso: 'ES', name: 'Spain', code: '34' },
  { iso: 'SE', name: 'Sweden', code: '46' },
  { iso: 'CH', name: 'Switzerland', code: '41' },
  { iso: 'US', name: 'United States', code: '1' },
];

export const DEFAULT_DIALLING_ISO = 'IE';

/** An Irish mobile, after +353: 83, 85, 86, 87 or 89, then seven digits. */
const IRISH_MOBILE = /^8[35679]\d{7}$/;

/** The longest calling code on the list that this international number begins with. */
function codeOf(digits: string): string | null {
  const match = diallingCodes
    .map((entry) => entry.code)
    .filter((code) => digits.startsWith(code))
    .sort((a, b) => b.length - a.length)[0];
  return match ?? null;
}

export type MobileRead =
  /** A number Gaff can text, as +353871234567. */
  | { ok: true; mobile: string }
  /** `invalid`: not a mobile number. `not_texted`: a real one, in a country not on the list. */
  | { ok: false; reason: 'invalid' | 'not_texted' };

/**
 * Reads a mobile number from what was typed. With a plus (or 00) it is taken as written, whatever
 * the picker says. Without one it belongs to the country picked, and the 0 it's dialled with at
 * home is dropped: "087 123 4567" with Ireland is +353871234567.
 */
export function readMobile(typed: string, iso: string = DEFAULT_DIALLING_ISO): MobileRead {
  let digits = typed.replace(/[\s().-]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  const international = digits.startsWith('+');
  if (international) digits = digits.slice(1);
  if (!/^\d{6,15}$/.test(digits)) return { ok: false, reason: 'invalid' };

  let code: string | null;
  let national: string;
  if (international) {
    code = codeOf(digits);
    if (!code) return { ok: false, reason: 'not_texted' };
    national = digits.slice(code.length);
  } else {
    code = diallingCodes.find((entry) => entry.iso === iso)?.code ?? null;
    if (!code) return { ok: false, reason: 'invalid' };
    national = digits;
  }
  national = national.replace(/^0+/, '');
  if (code === '353' ? !IRISH_MOBILE.test(national) : !/^\d{6,12}$/.test(national)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, mobile: `+${code}${national}` };
}

/** Whether what's typed so far is a number and not an email: it starts with a digit or a plus. */
export function looksLikeMobile(typed: string): boolean {
  const start = typed.trim();
  return /^[+\d(]/.test(start) && !start.includes('@');
}

/**
 * UX-SI-16: whether what's typed so far is a number that still needs a country code: a mobile
 * number typed the way it's dialled at home. One typed with a plus (or 00) carries its own.
 */
export function needsDiallingCode(typed: string): boolean {
  return looksLikeMobile(typed) && !/^(\+|00)/.test(typed.trim());
}

/** "+353871234567" → "087 123 4567"; any other, "+44 7700900123": as its owner would know it. */
export function showMobile(mobile: string): string {
  if (mobile.startsWith('+353') && mobile.length === 13) {
    return `0${mobile.slice(4, 6)} ${mobile.slice(6, 9)} ${mobile.slice(9)}`;
  }
  const digits = mobile.replace(/^\+/, '');
  const code = codeOf(digits) ?? '';
  return `+${code} ${digits.slice(code.length)}`.trim();
}

/** "+353871234567" → "087 ••• 4567": enough to recognise it, not enough to copy. */
export function maskedMobile(mobile: string): string {
  const last = mobile.slice(-4);
  if (mobile.startsWith('+353') && mobile.length === 13)
    return `0${mobile.slice(4, 6)} ••• ${last}`;
  const code = codeOf(mobile.replace(/^\+/, '')) ?? '';
  return `+${code} ••• ${last}`;
}

/** The last four digits, for an email that names a number without giving it away. */
export function mobileEnding(mobile: string): string {
  return mobile.slice(-4);
}

/**
 * How long a number goes on vouching for the person who proved it. Phone companies hand an
 * unused number to someone new after some months. So a number that hasn't signed anyone in for
 * this long gets nobody in by itself: its holder proves their email as well, and the number
 * goes to whoever does.
 */
export const MOBILE_VOUCHES_DAYS = 180;

export function mobileStillVouches(provenAt: Date, now: Date): boolean {
  return now.getTime() - provenAt.getTime() < MOBILE_VOUCHES_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * How long a browser that has just proved a number may take to give the email that goes with
 * it. After that it starts again.
 */
export const PROVEN_MOBILE_MINUTES = 15;

export function mobileProofStands(provenAt: Date, now: Date): boolean {
  const age = now.getTime() - provenAt.getTime();
  return age >= 0 && age < PROVEN_MOBILE_MINUTES * 60_000;
}

/**
 * Whether sign-in by mobile is offered. `real` where texts are really sent. `stand_in` locally
 * and in tests with the development tools on, where the text is in the outbox. Otherwise `off`:
 * the field asks for an email only. Never the stand-in on the test copy or in production, where
 * a code nobody was texted would let anyone in as the number's owner.
 */
export type MobileSignInMode = 'real' | 'stand_in' | 'off';

export function mobileSignInMode(input: {
  smsProvider: 'fake' | 'sinch';
  devTools: boolean;
  gaffEnv: 'development' | 'test' | 'staging' | 'production';
}): MobileSignInMode {
  if (input.smsProvider === 'sinch') return 'real';
  const local = input.gaffEnv === 'development' || input.gaffEnv === 'test';
  return input.devTools && local ? 'stand_in' : 'off';
}
