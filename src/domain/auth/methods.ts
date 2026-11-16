import { z } from 'zod';

/**
 * UX-SI-1: the ways a person can sign in. There are no passwords. The same codes split the
 * sign-in funnel (UX-ME-1).
 */
export const signInMethods = ['email_code', 'google', 'apple', 'passkey'] as const;
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
 * aren't and the development tools are on; otherwise `off`, and its button isn't shown.
 */
export type ProviderMode = 'real' | 'stand_in' | 'off';

export function providerMode(input: { credentialsSet: boolean; devTools: boolean }): ProviderMode {
  if (input.credentialsSet) return 'real';
  return input.devTools ? 'stand_in' : 'off';
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
