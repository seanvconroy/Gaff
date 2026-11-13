/**
 * AU12: how often each step of signing in may be tried. Counted per network address and, where
 * an email is given, per email, so nobody can guess passwords or codes at speed, or fill
 * someone's inbox with codes. The counting is in src/server/auth/limits.ts.
 */

export interface Limit {
  max: number;
  windowSeconds: number;
}

export type LimitedStep =
  'password' | 'sign_up' | 'send_code' | 'check_code' | 'provider' | 'passkey_options' | 'passkey';

export const perAddress: Record<LimitedStep, Limit> = {
  password: { max: 5, windowSeconds: 60 },
  sign_up: { max: 3, windowSeconds: 60 },
  send_code: { max: 5, windowSeconds: 60 },
  check_code: { max: 10, windowSeconds: 60 },
  provider: { max: 10, windowSeconds: 60 },
  // The sign-in page asks for these as it loads, to offer a passkey in the browser's autofill.
  passkey_options: { max: 30, windowSeconds: 60 },
  passkey: { max: 10, windowSeconds: 60 },
};

export const perEmail: Partial<Record<LimitedStep, Limit>> = {
  sign_up: { max: 3, windowSeconds: 600 },
  send_code: { max: 5, windowSeconds: 3600 },
};

/**
 * New passwords checked against known breaches, from one address. Checked before the step's own
 * limit, so choosing a password that's refused doesn't use up the tries for signing up.
 */
export const PASSWORD_CHECKS: Limit = { max: 20, windowSeconds: 60 };

/**
 * Wrong passwords for one email, from anywhere. Past this, password sign-in pauses for that
 * email until the window ends. Email codes still work, so nobody can lock someone out.
 */
export const PASSWORD_FAILURES: Limit = { max: 10, windowSeconds: 900 };

const steps: Record<string, LimitedStep> = {
  '/sign-in/email': 'password',
  '/sign-up/email': 'sign_up',
  '/email-otp/send-verification-otp': 'send_code',
  '/email-otp/request-password-reset': 'send_code',
  '/forget-password/email-otp': 'send_code',
  '/send-verification-email': 'send_code',
  '/sign-in/email-otp': 'check_code',
  '/email-otp/verify-email': 'check_code',
  '/email-otp/reset-password': 'check_code',
  '/email-otp/check-verification-otp': 'check_code',
  '/sign-in/social': 'provider',
  '/link-social': 'provider',
  '/passkey/generate-authenticate-options': 'passkey_options',
  '/passkey/verify-authentication': 'passkey',
};

/** The limited step a sign-in call belongs to, by its route. Null for everything else. */
export function stepForPath(path: string): LimitedStep | null {
  // Coming back from Google or Apple: the route is "/callback/:id", or the path with its name.
  if (path.startsWith('/callback/')) return 'provider';
  return steps[path] ?? null;
}

export function overLimit(hits: number, limit: Limit): boolean {
  return hits > limit.max;
}

/** End-to-end runs sign in constantly from one address: the same code, with more room. */
export function scaled(limit: Limit, multiplier: number): Limit {
  return { max: limit.max * multiplier, windowSeconds: limit.windowSeconds };
}
