import { createHash } from 'node:crypto';
import type { GenericOAuthConfig } from 'better-auth/plugins/generic-oauth';
import type { SignInProvider } from '@/domain/auth/methods';
import { openJson, sealJson } from '@/lib/crypto';
import type { ProviderPerson } from '@/ports/sign-in-providers';

/**
 * A local stand-in for Google and Apple (rule 10: nothing needs a real account to build). It is
 * registered only when the development tools are on and the provider's real credentials aren't
 * set, in development and tests only: never on the test copy (staging) or in production, where
 * anyone who reached its page could sign in as anybody (BA-1).
 *
 * "Continue with Google" then goes to a development page, /dev/sign-in/google, where a tester
 * says who is signing in, or cancels. The page comes back to Better Auth's own callback with a
 * sealed note of that made-up person in place of the provider's authorisation code, so
 * everything after it (creating the person, joining by verified email, the session) is the real
 * code path.
 */
const NOTE_LASTS_MS = 5 * 60 * 1000;

interface SealedPerson extends ProviderPerson {
  expiresAt: number;
}

export function standInPath(provider: SignInProvider): string {
  return `/dev/sign-in/${provider}`;
}

/** The made-up person, from what the tester typed on the stand-in page. */
export function standInPerson(
  provider: SignInProvider,
  input: { name: string; email: string; hideEmail?: boolean; unverified?: boolean },
): ProviderPerson {
  const typed = input.email.trim().toLowerCase();
  const digest = createHash('sha256').update(`${provider}:${typed}`).digest('hex');
  return {
    provider,
    id: `stand-in-${digest.slice(0, 24)}`,
    // UX-SI-11: Apple's "Hide My Email" hands over a relay address in place of the person's own.
    email:
      provider === 'apple' && input.hideEmail
        ? `${digest.slice(0, 10)}@privaterelay.appleid.com`
        : typed,
    emailVerified: !input.unverified,
    name: input.name.trim(),
  };
}

/** What the stand-in page hands back in place of an authorisation code. */
export function sealStandInPerson(person: ProviderPerson, now = Date.now()): string {
  return sealJson({ ...person, expiresAt: now + NOTE_LASTS_MS } satisfies SealedPerson);
}

export function openStandInPerson(
  note: string,
  provider: SignInProvider,
  now = Date.now(),
): ProviderPerson | null {
  try {
    const { expiresAt, ...person } = openJson<SealedPerson>(note);
    if (person.provider !== provider || expiresAt < now) return null;
    return person;
  } catch {
    return null;
  }
}

/** The stand-ins, as providers Better Auth can use in place of the real ones. */
export function standInProviders(
  providers: readonly SignInProvider[],
  appUrl: string,
): GenericOAuthConfig[] {
  return providers.map((provider) => ({
    providerId: provider,
    clientId: 'gaff-stand-in',
    authorizationUrl: new URL(standInPath(provider), appUrl).toString(),
    pkce: false,
    // The "code" is the sealed person: there is no token endpoint to call.
    getToken: async ({ code }) => ({ accessToken: code, tokenType: 'Bearer' }),
    getUserInfo: async (tokens) => {
      const person = tokens.accessToken ? openStandInPerson(tokens.accessToken, provider) : null;
      if (!person) return null;
      return {
        id: person.id,
        email: person.email,
        emailVerified: person.emailVerified,
        name: person.name,
      };
    },
  }));
}
