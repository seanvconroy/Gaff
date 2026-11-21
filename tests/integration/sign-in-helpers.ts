import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { sealStandInPerson } from '@/adapters/sign-in/stand-in';
import { desc, eq } from 'drizzle-orm';
import { signInCodeEmail } from '@/copy/sign-in';
import { db } from '@/db/client';
import { devOutbox } from '@/db/schema';
import type { Joining } from '@/domain/auth/joining';
import type { SignInProvider } from '@/domain/auth/methods';
import { auth } from '@/server/auth/auth';
import { sendCode } from '@/server/auth/codes';
import { cookieNames } from '@/server/auth/cookies';
import type { ProviderPerson } from '@/ports/sign-in-providers';

/**
 * Signing in for integration tests, through Gaff's own sign-in endpoints and Better Auth's own
 * callback, the way the screens do: in-process, as a server action calls them (AU12: over HTTP
 * only the routes a browser needs answer). Google and Apple are the stand-ins.
 */
export const APP = process.env.APP_URL ?? 'http://localhost:3000';

/** A made-up network address, so tests never share a limiter's counter. */
export const anAddress = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}-${randomUUID()}`;

/** The cookies a response sets, as the browser would send them back. */
export function cookiesFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

/** Headers for a request from this browser's cookies, from a network address of its own. */
export function from(cookie: string, address = anAddress()): Headers {
  return new Headers({ cookie, 'x-forwarded-for': address });
}

/**
 * Asks for a sign-in code, as the sign-in screen does. `joining` is what the code also joins to
 * whoever enters it (UX-SI-15), which the server writes as it sends the code.
 */
export async function askForCode(
  email: string,
  browserKey: string | null = null,
  joining: Joining | null = null,
) {
  let code = '';
  const result = await sendCode({
    purpose: 'sign_in',
    subject: email,
    to: email,
    browserKey,
    linkPath: '/sign-in/open',
    joining,
    compose: (sent, link) => {
      code = sent;
      return signInCodeEmail(sent, link);
    },
  });
  if (!result.sent) throw new Error(`the code was not sent: ${result.reason}`);
  return {
    code,
    browserKey: result.browserKey,
    cookie: `${cookieNames.signInCode}=${result.browserKey}`,
  };
}

/** One try at a code, through Gaff's own endpoint, from this browser's cookies. */
export async function enterCode(code: string, cookie: string) {
  const { headers, response } = await auth().api.signInWithCode({
    body: { code },
    headers: from(cookie),
    returnHeaders: true,
  });
  return { response, cookie: cookiesFrom(headers) };
}

/** The code in the newest email in the development outbox to this address. */
export async function codeEmailedTo(email: string) {
  const [sent] = await db()
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, email))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  const code = sent?.subject.match(/^(\d{6}) /)?.[1];
  if (!sent || !code) throw new Error('no code was emailed to that address');
  return { code, text: sent.text };
}

/** Signs in by email code, through Gaff's own endpoint. Returns the session's cookies. */
export async function signInByCode(email: string, cookieBefore = '') {
  const { code, cookie } = await askForCode(email);
  const { headers, response } = await auth().api.signInWithCode({
    body: { code },
    headers: from([cookieBefore, cookie].filter(Boolean).join('; ')),
    returnHeaders: true,
  });
  if (response.result !== 'correct') throw new Error(`not signed in: ${response.result}`);
  return { userId: response.userId, cookie: cookiesFrom(headers) };
}

/**
 * "Continue with Google" or "Continue with Apple" (or, with `cookie` and `link`, connecting one
 * on Profile), with the stand-in answering as the provider. Returns where the person is sent,
 * and their cookies.
 */
export async function continueWith(
  person: ProviderPerson,
  options: { cookie?: string; link?: boolean } = {},
) {
  const provider: SignInProvider = person.provider;
  const signedIn = options.cookie ?? '';
  const started = options.link
    ? await auth().api.linkSocialAccount({
        body: {
          provider,
          callbackURL: '/profile',
          errorCallbackURL: '/profile',
          disableRedirect: true,
        },
        headers: from(signedIn),
        returnHeaders: true,
      })
    : await auth().api.signInSocial({
        body: {
          provider,
          callbackURL: '/sign-in/return',
          errorCallbackURL: `/sign-in?from=${provider}`,
          disableRedirect: true,
        },
        headers: from(signedIn),
        returnHeaders: true,
      });
  const { url } = started.response as { url: string };
  // The stand-in's own page, on this site.
  expect(url.startsWith(`${APP}/dev/sign-in/${provider}?`)).toBe(true);
  const callback = new URL(`${APP}/api/auth/callback/${provider}`);
  callback.searchParams.set('state', new URL(url).searchParams.get('state')!);
  callback.searchParams.set('code', sealStandInPerson(person));
  const cookie = [signedIn, cookiesFrom(started.headers)].filter(Boolean).join('; ');
  const back = await auth().handler(new Request(callback, { headers: from(cookie) }));
  expect(back.status).toBe(302);
  const after = cookiesFrom(back.headers);
  return {
    location: new URL(back.headers.get('location')!, APP),
    cookie: after,
    signedIn: /session_token=[^;]+/.test(after),
  };
}

export async function whoIs(cookie: string) {
  const session = await auth().api.getSession({ headers: new Headers({ cookie }) });
  return session?.user ?? null;
}
