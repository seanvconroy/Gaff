import { z } from 'zod';

/**
 * UX-SI-1: the ways a person can sign in. There are no passwords. The same codes split the
 * sign-in funnel (UX-ME-1). `sms_code` is a six-digit code by text to a mobile (UX-SI-13).
 */
export const signInMethods = ['email_code', 'sms_code', 'google', 'apple', 'passkey'] as const;
export const signInMethodSchema = z.enum(signInMethods);
export type SignInMethod = z.infer<typeof signInMethodSchema>;

/** Google and Apple: the two outside providers, approved for sign-in only (Q30). */
export const signInProviders = ['google', 'apple'] as const;
export const signInProviderSchema = z.enum(signInProviders);
export type SignInProvider = z.infer<typeof signInProviderSchema>;

/** The method in what came back from the browser, or null if it isn't one. */
export function signInMethodFrom(value: unknown): SignInMethod | null {
  const parsed = signInMethodSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * UX-SI-6: which method was used last on this device. All that is kept is the method's code, in
 * a cookie on the device itself: nothing about who used it.
 */
export const LAST_METHOD_DAYS = 400;

/**
 * How a provider is switched on. `real` when its credentials are set; `stand_in` when they
 * aren't, the development tools are on, and Gaff runs locally or in tests; otherwise `off`, and
 * its button isn't shown. Never the stand-in on the test copy (staging) or in production: anyone
 * who could reach its page could sign in as anybody, Gaff's own team included (BA-1, AU1).
 */
export type ProviderMode = 'real' | 'stand_in' | 'off';

export function providerMode(input: {
  credentialsSet: boolean;
  devTools: boolean;
  gaffEnv: 'development' | 'test' | 'staging' | 'production';
}): ProviderMode {
  if (input.credentialsSet) return 'real';
  const local = input.gaffEnv === 'development' || input.gaffEnv === 'test';
  return input.devTools && local ? 'stand_in' : 'off';
}

/**
 * UX-SI-11: Apple's "Hide My Email" gives each person a relay address that forwards to their
 * own. It is a real, verified address and is accepted as the person's email like any other. A
 * later package uses this to ask an invitee to confirm the address the invite went to.
 */
export function isAppleRelayAddress(email: string): boolean {
  return /@privaterelay\.appleid\.com$/i.test(email.trim());
}

/**
 * A provider's answer that isn't an error to show: the person pressed Cancel, or closed the
 * provider's page (UX-SI states: "Back on the sign-in screen, no error").
 */
export function isProviderCancel(error: string): boolean {
  return ['access_denied', 'user_cancelled_authorize', 'user_cancelled_login'].includes(error);
}

/**
 * BA-8 (M5, AU8): the method a session began with, from the sign-in call that's making it, so
 * the session can keep it. Null for anything that isn't a sign-in.
 */
export function methodForPath(path: string, providerId?: string): SignInMethod | null {
  // A code: by email unless the endpoint says it came by text (`codeMethod`, below).
  if (isCodePath(path)) return 'email_code';
  if (path === '/passkey/verify-authentication') return 'passkey';
  // Coming back from Google or Apple: the route is "/callback/:id", or the path with its name.
  if (!path.startsWith('/callback/')) return null;
  const id = providerId ?? path.slice('/callback/'.length);
  return id === 'google' || id === 'apple' ? id : null;
}

/** Gaff's own endpoints that take a code, typed or by the email's button. */
export function isCodePath(path: string): boolean {
  return path === '/gaff/sign-in/code' || path === '/gaff/sign-in/link';
}

/**
 * UX-SI-13: a code is the one way in that comes two ways, and the route is the same for both.
 * So Gaff's code endpoint names which it was as it makes the session, and that is believed only
 * there: for any other route the method comes from the route, and never from a browser.
 */
export function codeMethod(path: string, named: unknown): SignInMethod | null {
  if (!isCodePath(path)) return null;
  return named === 'sms_code' ? 'sms_code' : 'email_code';
}
