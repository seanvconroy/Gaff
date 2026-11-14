import type { SocialProvider } from '@/domain/auth/email-authority';
import { auth } from '@/server/auth/auth';
import { sendSignInCode } from '@/server/auth/flows';
import {
  issueStandInCode,
  standInIdentity,
  type StandInIdentity,
} from '@/server/auth/stand-in-provider';
import { db } from '@/db/client';
import { devOutbox } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

const APP = process.env.APP_URL ?? 'http://localhost:3000';

/** A browser's cookies, as far as these tests need them: what was set, sent back. */
export class Jar {
  private readonly cookies = new Map<string, string>();

  take(headers: Headers): this {
    for (const line of headers.getSetCookie()) {
      const [pair] = line.split(';');
      const at = pair!.indexOf('=');
      const name = pair!.slice(0, at).trim();
      const value = pair!.slice(at + 1);
      if (/max-age=0/i.test(line) || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return this;
  }

  headers(address: string = crypto.randomUUID()): Headers {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    return new Headers({ 'x-forwarded-for': address, ...(cookie ? { cookie } : {}) });
  }

  get signedIn(): boolean {
    return [...this.cookies.keys()].some((name) => name.endsWith('session_token'));
  }
}

export async function latestCodeTo(address: string): Promise<string> {
  const [latest] = await db()
    .select({ subject: devOutbox.subject })
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, address))
    .orderBy(desc(devOutbox.createdAt), desc(devOutbox.id))
    .limit(1);
  const code = latest?.subject.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error(`No code was sent to ${address}`);
  return code;
}

/** Signs in with an emailed code, in this jar. A new address gets a new, confirmed account. */
export async function signInByCode(email: string, jar = new Jar()): Promise<Jar> {
  const sent = await sendSignInCode(email, jar.headers());
  if (sent !== 'sent') throw new Error(`code not sent: ${sent}`);
  const signedIn = await auth().api.signInEmailOTP({
    body: { email, otp: await latestCodeTo(email) },
    headers: jar.headers(),
    returnHeaders: true,
  });
  return jar.take(signedIn.headers);
}

export interface ProviderResult {
  /** Where the person is sent once the provider has answered: the page asked for, or an error. */
  location: string;
  /** The `?error=` code on that address, if there is one. */
  error: string | null;
  jar: Jar;
}

async function followCallback(
  provider: SocialProvider,
  startUrl: string,
  jar: Jar,
  answer: { identity: StandInIdentity; codeFor?: 'this' | 'another' } | { cancelled: true },
  how: 'query' | 'form_post',
): Promise<ProviderResult> {
  const asked = new URL(startUrl);
  const state = asked.searchParams.get('state')!;
  const params = new URLSearchParams({ state });
  if ('cancelled' in answer) {
    params.set('error', 'access_denied');
  } else {
    const challenge =
      answer.codeFor === 'another'
        ? 'a-challenge-from-another-sign-in'
        : (asked.searchParams.get('code_challenge') ?? undefined);
    params.set('code', await issueStandInCode(provider, answer.identity, challenge));
  }
  const callback = `${APP}/api/auth/callback/${provider}`;
  let response: Response;
  if (how === 'form_post') {
    // Apple's way: a form post, which Better Auth turns into a GET so cookies come with it.
    const posted = await auth().handler(
      new Request(callback, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': crypto.randomUUID(),
        },
        body: params.toString(),
      }),
    );
    const next = posted.headers.get('location');
    if (posted.status !== 302 || !next) throw new Error(`form post answered ${posted.status}`);
    response = await auth().handler(new Request(next, { headers: jar.headers() }));
  } else {
    response = await auth().handler(
      new Request(`${callback}?${params}`, { headers: jar.headers() }),
    );
  }
  jar.take(response.headers);
  const location = response.headers.get('location') ?? '';
  const error = location ? new URL(location, APP).searchParams.get('error') : null;
  return { location, error, jar };
}

type Chosen = Parameters<typeof standInIdentity>[1];

/**
 * "Continue with Google" or "Continue with Apple", played end to end through Better Auth's own
 * sign-in call and callback, with the stand-in as the provider.
 */
export async function continueWith(
  provider: SocialProvider,
  chosen: Partial<Chosen> & { email: string },
  options: {
    jar?: Jar;
    identity?: StandInIdentity;
    cancelled?: boolean;
    codeFor?: 'this' | 'another';
    how?: 'query' | 'form_post';
  } = {},
): Promise<ProviderResult> {
  const jar = options.jar ?? new Jar();
  const started = await auth().api.signInSocial({
    body: {
      provider,
      callbackURL: '/after',
      errorCallbackURL: `/sign-in?provider=${provider}`,
    },
    headers: jar.headers(),
    returnHeaders: true,
  });
  jar.take(started.headers);
  const identity =
    options.identity ?? standInIdentity(provider, { name: 'Ann Power', verified: true, ...chosen });
  return followCallback(
    provider,
    started.response.url!,
    jar,
    options.cancelled ? { cancelled: true } : { identity, codeFor: options.codeFor },
    options.how ?? (provider === 'apple' ? 'form_post' : 'query'),
  );
}

/** "Connect Google" from How you sign in: joining a provider to the account that's signed in. */
export async function connect(
  provider: SocialProvider,
  chosen: Partial<Chosen> & { email: string },
  jar: Jar,
): Promise<ProviderResult> {
  const started = await auth().api.linkSocialAccount({
    body: {
      provider,
      callbackURL: '/account/security',
      errorCallbackURL: `/account/security?provider=${provider}`,
    },
    headers: jar.headers(),
    returnHeaders: true,
  });
  jar.take(started.headers);
  const identity = standInIdentity(provider, { name: 'Ann Power', verified: true, ...chosen });
  return followCallback(
    provider,
    started.response.url,
    jar,
    { identity },
    provider === 'apple' ? 'form_post' : 'query',
  );
}
