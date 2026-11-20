import { cookies } from 'next/headers';
import { LINK_CODE_LASTS_MINUTES } from '@/domain/auth/confirm';
import { needsCode } from '@/domain/renter/path';
import {
  checkLinkCode,
  linkCodeCookie,
  linkPassCookie,
  linkPassStands,
  maskedEmail,
  sendLinkCode,
} from '@/server/access/link-codes';
import { cookieLifetimes, cookieOptions } from '@/server/auth/cookies';
import { signedIn } from '@/server/auth/member';

/**
 * UX-RN-14, UX-SI-12 (ADR-0013): the cookie side of the one-time code on a renter's link. A
 * private link is enough to answer questions and book a viewing; the pages that show their
 * checks or the lister's bank details, and a change of the email Gaff writes to, also need the
 * code sent to the email on the application, unless the person is signed in with that email.
 * The rules are in src/server/access/link-codes.ts and `needsCode`.
 */

/** Whether this browser may open the guarded pages behind this link. */
export async function linkIsOpen(token: string, applicationEmail: string): Promise<boolean> {
  const jar = await cookies();
  const hasPass = linkPassStands(token, jar.get(linkPassCookie(token))?.value);
  if (hasPass) return true;
  const person = await signedIn();
  return !needsCode({
    hasPass,
    signedInEmail: person?.user.email ?? null,
    applicationEmail,
  });
}

export type SendGateCodeResult =
  | { sent: true; sentTo: string; again: boolean }
  | { sent: false; reason: 'too_many' | 'not_sent' | 'no_link' };

/** Emails the code to the address on the application, tied to this browser. */
export async function sendGateCode(token: string): Promise<SendGateCodeResult> {
  const jar = await cookies();
  const name = linkCodeCookie(token);
  const result = await sendLinkCode({ token, browserKey: jar.get(name)?.value ?? null });
  if (!('browserKey' in result)) return { sent: false, reason: result.reason };
  jar.set(name, result.browserKey, cookieOptions(cookieLifetimes.code));
  // A code sent less than half a minute ago still stands: nothing new went, and that's fine.
  return { sent: true, sentTo: result.sentTo, again: !result.sent };
}

/** One try at the code. The right one opens the guarded pages in this browser for half an hour. */
export async function enterGateCode(
  token: string,
  code: string,
): Promise<'correct' | 'wrong' | 'finished'> {
  const jar = await cookies();
  const tried = await checkLinkCode({
    token,
    browserKey: jar.get(linkCodeCookie(token))?.value ?? null,
    code,
  });
  if (tried.result !== 'correct') return tried.result;
  jar.set(linkPassCookie(token), tried.pass, cookieOptions(LINK_CODE_LASTS_MINUTES * 60));
  return 'correct';
}

/** Which inbox a code would go to, with most of the address hidden. */
export const inboxHint = maskedEmail;
