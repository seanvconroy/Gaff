import { isAppleRelayAddress, type SignInProvider } from './methods';

/**
 * AU4: when Google or Apple can vouch that the person signing in controls an email address.
 *
 * Both say an address is "verified" if they checked it once, even an address they don't host:
 * a Google account can be made with a work address that someone else runs. Only the host of an
 * address knows who controls it today. So Gaff joins a Google or Apple sign-in to someone by
 * email only when the provider hosts that address (Google's own guidance for linking accounts).
 * Otherwise the person proves the address with a code first (ADR-0015's "take back by code"),
 * and connects the provider themselves from "How you sign in", signed in.
 */

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const APPLE_DOMAINS = new Set(['icloud.com', 'me.com', 'mac.com', 'privaterelay.appleid.com']);

/** What a provider's answer says about the address. Apple sends "true" as a word. */
export interface EmailClaims {
  email?: unknown;
  emailVerified?: unknown;
  /** Google's `hd`: the Google Workspace domain, present only for Workspace accounts. */
  hostedDomain?: unknown;
}

function domainOf(email: unknown): string {
  if (typeof email !== 'string') return '';
  const at = email.lastIndexOf('@');
  return at > 0
    ? email
        .slice(at + 1)
        .trim()
        .toLowerCase()
    : '';
}

/** Whether the provider says it checked the address at all. */
export function saysVerified(claims: EmailClaims): boolean {
  return claims.emailVerified === true || claims.emailVerified === 'true';
}

/** Whether the provider hosts this address, and so can vouch for who controls it today. */
export function hostsThisEmail(provider: SignInProvider, claims: EmailClaims): boolean {
  if (!saysVerified(claims)) return false;
  const domain = domainOf(claims.email);
  if (!domain) return false;
  if (provider === 'google') {
    const workspace =
      typeof claims.hostedDomain === 'string' &&
      claims.hostedDomain.trim().toLowerCase() === domain;
    return GOOGLE_DOMAINS.has(domain) || workspace;
  }
  return APPLE_DOMAINS.has(domain);
}

/**
 * Why a Google or Apple sign-in wasn't joined to anyone. Each is a code the sign-in screen puts
 * into words (src/copy/sign-in.ts).
 *
 * - `email_not_verified`: the provider says it never checked the address.
 * - `confirm_email_first`: nobody has the address yet, and the provider doesn't host it.
 * - `account_not_linked`: someone has the address, and the provider doesn't host it.
 */
export const notJoinedReasons = [
  'email_not_verified',
  'confirm_email_first',
  'account_not_linked',
] as const;
export type NotJoinedReason = (typeof notJoinedReasons)[number];

/**
 * AU4, the whole rule, for a provider account Gaff hasn't seen before. A provider account that's
 * already one of someone's ways in signs that person in, by the provider's own ID for them, and
 * never comes here. Null means the sign-in may go on.
 */
export function joinRefusal(input: {
  provider: SignInProvider;
  claims: EmailClaims;
  /** Nobody has the address: the sign-in would make a new person. */
  newPerson: boolean;
  /** The person is signed in and connecting it from "How you sign in" themselves. */
  connectingWhileSignedIn: boolean;
}): NotJoinedReason | null {
  if (!saysVerified(input.claims)) return 'email_not_verified';
  if (input.connectingWhileSignedIn) return null;
  if (hostsThisEmail(input.provider, input.claims)) return null;
  return input.newPerson ? 'confirm_email_first' : 'account_not_linked';
}

/** A way in to a person's account, as "How you sign in" lists them. */
export type WayIn = 'email_code' | SignInProvider | 'passkey';

/**
 * AU7: whether one way in can be removed, and why not. A code by email always reaches a
 * verified address, so the others can go, with two exceptions:
 *
 * - Apple stays on an account whose address Apple made (Hide My Email): nobody knows that
 *   address by heart to ask for a code, so Apple is the way in.
 * - Nothing goes if it would leave the person no way in at all.
 */
export type RemovalRefusal = 'hide_my_email' | 'last_way_in';

export function removalRefusal(input: {
  remove: Exclude<WayIn, 'email_code'>;
  email: string;
  emailVerified: boolean;
  providers: readonly SignInProvider[];
  passkeys: number;
}): RemovalRefusal | null {
  const relay = isAppleRelayAddress(input.email);
  if (input.remove === 'apple' && relay) return 'hide_my_email';
  const codes = input.emailVerified && !relay;
  const providersLeft = input.providers.filter((p) => p !== input.remove).length;
  const passkeysLeft = input.passkeys - (input.remove === 'passkey' ? 1 : 0);
  if (!codes && providersLeft === 0 && passkeysLeft <= 0) return 'last_way_in';
  return null;
}
