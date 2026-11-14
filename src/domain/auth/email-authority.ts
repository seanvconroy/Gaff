/**
 * AU4: when Google or Apple can vouch that the person signing in controls an email address.
 *
 * Both say an address is "verified" if they checked it once, even an address they don't host:
 * a Google account can be made with a work address that someone else runs. Only the host of an
 * address knows who controls it today. So Gaff joins a Google or Apple sign-in to an existing
 * account by email only when the provider hosts that address (Google's own guidance for
 * linking accounts). Otherwise the person signs in another way and connects it themselves.
 */

export type SocialProvider = 'google' | 'apple';

export const socialProviders = ['google', 'apple'] as const;

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const APPLE_RELAY_DOMAIN = 'privaterelay.appleid.com';
const APPLE_DOMAINS = new Set(['icloud.com', 'me.com', 'mac.com', APPLE_RELAY_DOMAIN]);

/** What a provider's ID token says about the address. Apple sends "true" as a word. */
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

/** Whether the provider hosts this address, and so can vouch for who controls it. */
export function hostsThisEmail(provider: SocialProvider, claims: EmailClaims): boolean {
  if (!saysVerified(claims)) return false;
  const domain = domainOf(claims.email);
  if (!domain) return false;
  if (provider === 'google') {
    const workspace = typeof claims.hostedDomain === 'string' && claims.hostedDomain.trim() !== '';
    return GOOGLE_DOMAINS.has(domain) || workspace;
  }
  return APPLE_DOMAINS.has(domain);
}

/** Apple's Hide My Email: a relay address that forwards to the person's real one. */
export function isPrivateRelay(email: string): boolean {
  return domainOf(email) === APPLE_RELAY_DOMAIN;
}
