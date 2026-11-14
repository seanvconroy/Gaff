import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db/client';
import { verifications } from '@/db/schema';
import type { SocialProvider } from '@/domain/auth/email-authority';
import { env } from '@/lib/env';
import { openSigned, signValue } from '@/lib/signed-value';
import { prepareForProvider } from './identity';

/**
 * Local development and tests only: a stand-in for Google and Apple, like the outbox stands in
 * for email. A page of Gaff's own (/dev/sign-in-provider) plays the provider: the tester picks
 * who to be, and it sends them back with a code, the way a real provider does.
 *
 * Better Auth treats it as a real provider of the same name, through the same sign-in call and
 * the same callback, so the account rows, the linking rules (./identity) and the sessions are
 * the code that runs in production. Only the provider's own side is played. It is never offered
 * on the test copy or in production (./providers): whoever can open that page can be anyone.
 */

const CODE_MINUTES = 5;

/** What the tester chose, in the shape of the real provider's claims. */
export interface StandInIdentity {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  /** Google only: the Workspace domain, for a Workspace account. */
  hd?: string;
  /** Apple only: the address is a Hide My Email relay. */
  is_private_email?: boolean;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('base64url');
const codeKey = (provider: SocialProvider, code: string) =>
  `stand-in-provider:${provider}:${sha256(code)}`;

/** The identity the stand-in gives for what the tester typed. The same email is the same person. */
export function standInIdentity(
  provider: SocialProvider,
  input: { email: string; name: string; verified: boolean; workspace?: boolean; hidden?: boolean },
): StandInIdentity {
  const email = input.email.trim().toLowerCase();
  const sub = `stand-in-${sha256(`${provider}:${email}`).slice(0, 24)}`;
  if (provider === 'apple' && input.hidden) {
    return {
      sub,
      email: `${sha256(email)
        .slice(0, 10)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, 'x')}@privaterelay.appleid.com`,
      email_verified: input.verified,
      name: input.name,
      is_private_email: true,
    };
  }
  return {
    sub,
    email,
    email_verified: input.verified,
    name: input.name,
    ...(provider === 'google' && input.workspace ? { hd: email.split('@')[1] } : {}),
  };
}

/** Where a provider sends people back to. The stand-in refuses to send them anywhere else. */
export function callbackUrl(provider: SocialProvider): string {
  return new URL(`/api/auth/callback/${provider}`, env().APP_URL).toString();
}

/** Hands out a one-time code for this identity, tied to the sign-in that asked (PKCE). */
export async function issueStandInCode(
  provider: SocialProvider,
  identity: StandInIdentity,
  codeChallenge: string | undefined,
): Promise<string> {
  const code = randomBytes(24).toString('base64url');
  await db()
    .insert(verifications)
    .values({
      id: crypto.randomUUID(),
      identifier: codeKey(provider, code),
      value: JSON.stringify({ identity, codeChallenge: codeChallenge ?? null }),
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    });
  return code;
}

/** Exchanges a code for its identity, once, and only for the sign-in it was issued to. */
export async function redeemStandInCode(
  provider: SocialProvider,
  code: string,
  codeVerifier: string | undefined,
): Promise<StandInIdentity | null> {
  const [row] = await db()
    .delete(verifications)
    .where(
      and(
        eq(verifications.identifier, codeKey(provider, code)),
        gt(verifications.expiresAt, new Date()),
      ),
    )
    .returning({ value: verifications.value });
  if (!row) return null;
  const { identity, codeChallenge } = JSON.parse(row.value) as {
    identity: StandInIdentity;
    codeChallenge: string | null;
  };
  if (codeChallenge && (!codeVerifier || sha256(codeVerifier) !== codeChallenge)) return null;
  return identity;
}

/** The stand-ins as Better Auth providers (its generic OAuth plugin), named as the real ones. */
export function standInProviders(providers: SocialProvider[]) {
  const config = env();
  const secret = config.AUTH_SECRET;
  return providers.map((provider) => {
    const page = new URL(`/dev/sign-in-provider/${provider}`, config.APP_URL).toString();
    return {
      providerId: provider,
      clientId: 'gaff-stand-in',
      clientSecret: 'gaff-stand-in',
      authorizationUrl: page,
      tokenUrl: page,
      scopes: ['openid', 'email', 'profile'],
      pkce: true,
      // Apple answers with a form post; so does its stand-in.
      ...(provider === 'apple' ? { responseMode: 'form_post' as const } : {}),
      /** The provider's token endpoint, played in-process: no request leaves Gaff. */
      getToken: async (data: { code: string; codeVerifier?: string }) => {
        const identity = await redeemStandInCode(provider, data.code, data.codeVerifier);
        if (!identity) throw new Error('The stand-in provider did not issue this code');
        return {
          tokenType: 'Bearer',
          accessToken: 'stand-in',
          idToken: signValue(identity, secret, new Date(Date.now() + CODE_MINUTES * 60_000)),
        };
      },
      getUserInfo: async (tokens: { idToken?: string }) => {
        const identity = openSigned<StandInIdentity>(tokens.idToken, secret);
        if (!identity) return null;
        return {
          ...identity,
          id: identity.sub,
          emailVerified: identity.email_verified,
        };
      },
      mapProfileToUser: (profile: object) => prepareForProvider(provider, profile),
    };
  });
}
