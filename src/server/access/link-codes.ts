import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { senderAddress } from '@/adapters/email';
import { linkCodeEmail } from '@/copy/sign-in';
import { withOrg } from '@/db/client';
import { applications, lettings, organisations } from '@/db/schema';
import { LINK_CODE_LASTS_MINUTES } from '@/domain/auth/confirm';
import { env } from '@/lib/env';
import { sendCode, tryCode, type SendCodeResult } from '@/server/auth/codes';
import { hashToken, resolveAccessLink } from './links';

/**
 * UX-SI-12 (planned in ADR-0013): a private link is enough to answer questions and book a
 * viewing, but a forwarded link shouldn't be enough to read check results or bank details.
 * Pages that show those ask for a one-time code, sent to the email on that application.
 *
 * This is the reusable piece. NO PAGE USES IT YET: the renter's pages belong to a later
 * package (WP-12), which wires it in. It needs no account and no request, so it is tested on
 * its own (tests/integration/ux-si-link-codes.test.ts).
 *
 * How a page uses it, with the link's token from its URL:
 * 1. `linkPassStands(token, pass)` with the pass from the cookie `linkPassCookie(token)`. If it
 *    stands, show the page.
 * 2. Otherwise `sendLinkCode({ token, browserKey })`, with the browser's key from the cookie
 *    `linkCodeCookie(token)` (null the first time), and keep the returned `browserKey` in that
 *    cookie. Show a code input (`CodeInput`), with `sentTo` so the person knows which inbox.
 * 3. `checkLinkCode({ token, browserKey, code })`. On `correct`, keep the returned `pass` in
 *    the pass cookie (HTTP-only, `LINK_CODE_LASTS_MINUTES` long) and show the page.
 *
 * The same rules hold as for every code (src/server/auth/codes.ts): hashed, tied to the asking
 * browser, 10 minutes, five tries, a new one after 30 seconds. The pass remembers the code for
 * that link, in that browser, for half an hour; it is signed, so nothing more is stored.
 */

/** The cookie that ties a link's code to the browser that asked for it. */
export function linkCodeCookie(token: string): string {
  return `gaff_code_link_${hashToken(token).slice(0, 16)}`;
}

/** The cookie that remembers, for a short time, that the code was entered in this browser. */
export function linkPassCookie(token: string): string {
  return `gaff_link_pass_${hashToken(token).slice(0, 16)}`;
}

function passSignature(tokenHash: string, expires: number): Buffer {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`gaff:link-pass:${tokenHash}:${expires}`)
    .digest();
}

/** An email address with most of it hidden, to say which inbox without giving it away. */
export function maskedEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 1)}…@${domain}`;
}

async function applicationBehind(token: string) {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        email: applications.email,
        address: lettings.addressLine1,
        operatorName: organisations.name,
        slug: organisations.inboundSlug,
      })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .innerJoin(organisations, eq(organisations.id, applications.organisationId))
      .where(and(eq(applications.id, link.subjectId), isNull(applications.personalDataDeletedAt)));
    return row ?? null;
  });
}

export type SendLinkCodeResult =
  | (Extract<SendCodeResult, { browserKey: string }> & { sentTo: string })
  | Exclude<SendCodeResult, { browserKey: string }>
  /** Not a renter's link that still works, or the renter's details have been deleted. */
  | { sent: false; reason: 'no_link' };

/** Sends a code to the email on the application behind a renter's link. */
export async function sendLinkCode(
  input: { token: string; browserKey: string | null },
  now = new Date(),
): Promise<SendLinkCodeResult> {
  const application = await applicationBehind(input.token);
  if (!application) return { sent: false, reason: 'no_link' };
  const result = await sendCode(
    {
      purpose: 'private_link',
      subject: hashToken(input.token),
      to: application.email,
      browserKey: input.browserKey,
      compose: (code) => linkCodeEmail(code, application),
      // From the operator, as every message about their home is.
      from: {
        name: `${application.operatorName} via Gaff`,
        address: senderAddress(application.slug),
      },
    },
    now,
  );
  return 'browserKey' in result ? { ...result, sentTo: maskedEmail(application.email) } : result;
}

/** One try at a link's code. The right one gives a pass for that link, in that browser. */
export async function checkLinkCode(
  input: { token: string; browserKey: string | null; code: string },
  now = new Date(),
): Promise<{ result: 'correct'; pass: string } | { result: 'wrong' | 'finished' }> {
  const tokenHash = hashToken(input.token);
  const tried = await tryCode(
    { purpose: 'private_link', browserKey: input.browserKey, code: input.code, subject: tokenHash },
    now,
  );
  if (tried.result !== 'correct') return { result: tried.result };
  const expires = now.getTime() + LINK_CODE_LASTS_MINUTES * 60_000;
  return {
    result: 'correct',
    pass: `${expires}.${passSignature(tokenHash, expires).toString('base64url')}`,
  };
}

/** Whether a browser's pass still opens this link's sensitive pages. */
export function linkPassStands(
  token: string,
  pass: string | null | undefined,
  now = new Date(),
): boolean {
  if (!pass || pass.length > 100) return false;
  const [expiresText, given, ...rest] = pass.split('.');
  const expires = Number(expiresText);
  if (!given || rest.length > 0 || !Number.isSafeInteger(expires)) return false;
  if (expires <= now.getTime()) return false;
  const expected = passSignature(hashToken(token), expires);
  const actual = Buffer.from(given, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
