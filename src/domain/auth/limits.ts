/**
 * AU12: how often each step of signing in may be tried from one network address, so nobody can
 * guess codes at speed, fill someone's inbox with codes, or hammer the passkey and provider
 * routes. Counted in Postgres (src/server/auth/limits.ts), so a limit holds across every
 * serverless instance, and for calls Gaff's own forms make in-process as well as over HTTP.
 *
 * The limits on codes to one email address (five in ten minutes, twenty a day) are the code
 * store's own (src/domain/auth/codes.ts), and stay as they are.
 */

export interface Limit {
  max: number;
  windowSeconds: number;
}

/** One kind of try, counted on its own. Each of Gaff's sign-in endpoints has one. */
export const limitedSteps = [
  /** Asking for a sign-in code: "Continue" with an email, and "Send a new code". */
  'send_code',
  /** One try at a sign-in code, typed or by the email's button. */
  'check_code',
  /** "Continue with Google" or "Continue with Apple", connecting one, and coming back. */
  'provider',
  /** The challenge for a passkey sign-in. The sign-in screen asks for one as it loads. */
  'passkey_options',
  /** Signing in, or confirming it's you, with a passkey. */
  'passkey',
  /** Adding a passkey: its challenge and the device's answer. */
  'passkey_add',
  /** "Confirm it's you": asking for a code. */
  'confirm_send',
  /** "Confirm it's you": one try at the code. */
  'confirm_check',
] as const;
export type LimitedStep = (typeof limitedSteps)[number];

export const perAddress: Record<LimitedStep, Limit> = {
  send_code: { max: 5, windowSeconds: 60 },
  check_code: { max: 10, windowSeconds: 60 },
  provider: { max: 10, windowSeconds: 60 },
  // The sign-in screen asks for these as it loads, to offer a passkey on the email field.
  passkey_options: { max: 30, windowSeconds: 60 },
  passkey: { max: 10, windowSeconds: 60 },
  passkey_add: { max: 10, windowSeconds: 60 },
  confirm_send: { max: 5, windowSeconds: 60 },
  confirm_check: { max: 10, windowSeconds: 60 },
};

/**
 * M82 (BA-13): asking to view, at most 30 a day from one person (their account, or the email
 * they typed) or one network address: a real renter never comes near it, and a script stops.
 */
export const ASKS_TO_VIEW_PER_DAY: Limit = { max: 30, windowSeconds: 24 * 60 * 60 };

/** AU12, UX-AG-11: invitations, new or sent again, from one organisation. */
export const INVITES_PER_ORGANISATION: Limit = { max: 30, windowSeconds: 60 * 60 };

/**
 * The sign-in library's routes, and the step each is counted as. Gaff's own endpoints are under
 * `/gaff/`; the rest are Better Auth's own and its passkey plugin's.
 */
const steps: Record<string, LimitedStep> = {
  '/gaff/sign-in/code': 'check_code',
  '/gaff/sign-in/link': 'check_code',
  '/sign-in/social': 'provider',
  '/link-social': 'provider',
  '/passkey/generate-authenticate-options': 'passkey_options',
  '/passkey/verify-authentication': 'passkey',
  '/passkey/generate-register-options': 'passkey_add',
  '/passkey/verify-registration': 'passkey_add',
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

/**
 * How long until a caller who's over a limit may try again: the rest of the window, in whole
 * seconds, and at least one.
 */
export function secondsUntilRetry(windowStartedAt: Date, limit: Limit, now: Date): number {
  const ends = windowStartedAt.getTime() + limit.windowSeconds * 1000;
  return Math.max(1, Math.ceil((ends - now.getTime()) / 1000));
}

/** End-to-end runs sign in constantly from one address: the same code, with more room. */
export function scaled(limit: Limit, multiplier: number): Limit {
  return { max: limit.max * multiplier, windowSeconds: limit.windowSeconds };
}
