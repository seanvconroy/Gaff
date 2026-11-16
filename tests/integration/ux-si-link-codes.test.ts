import { desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { applications, devOutbox, oneTimeCodes } from '@/db/schema';
import { LINK_CODE_LASTS_MINUTES } from '@/domain/auth/confirm';
import {
  checkLinkCode,
  linkCodeCookie,
  linkPassCookie,
  linkPassStands,
  maskedEmail,
  sendLinkCode,
} from '@/server/access/link-codes';
import { hashToken } from '@/server/access/links';
import { loadRenterPage } from '@/server/renter/answers';
import { aLiveLetting, aRenterEnquires, createTestMember, renterTokenFor } from './helpers';

/**
 * UX-SI-12: the one-time code ADR-0013 planned for a private link's sensitive pages (check
 * results, bank details). The reusable piece, tested on its own: no renter page uses it yet.
 */
async function aRenterWithALink() {
  const member = await createTestMember();
  await aLiveLetting(member);
  const applicationId = await aRenterEnquires(member, 1);
  const token = await renterTokenFor(member, applicationId);
  const [application] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ email: applications.email })
      .from(applications)
      .where(eq(applications.id, applicationId)),
  );
  return { member, applicationId, token, email: application!.email };
}

async function codeMailTo(email: string) {
  const [mail] = await db()
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, email))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  return mail!;
}

describe('UX-SI-12: private links work as before, with no account', () => {
  it('opens a renter’s page from its link alone, with no code asked for', async () => {
    const { token } = await aRenterWithALink();
    const page = await loadRenterPage(token);
    expect(page).not.toBeNull();
  });
});

describe('UX-SI-12: a code for a private link’s sensitive pages', () => {
  it('goes to the email on that application, from the operator, with no link in it', async () => {
    const { token, email, member } = await aRenterWithALink();
    const sent = await sendLinkCode({ token, browserKey: null });
    expect(sent).toMatchObject({ sent: true, sentTo: maskedEmail(email) });
    const mail = await codeMailTo(email);
    expect(mail.subject).toMatch(/^\d{6} is your code for 12 Ranelagh Road$/);
    expect(mail.fromAddress).toContain(`${member.organisationName} via Gaff`);
    expect(mail.text).toContain('To open your page about 12 Ranelagh Road, enter this code:');
    expect(mail.text).not.toMatch(/https?:\/\//);
    // The address is never shown whole to whoever holds the link.
    expect(maskedEmail('aoife.byrne@example.ie')).toBe('a…@example.ie');
    expect(JSON.stringify(sent)).not.toContain(email);
  });

  it('is stored hashed, under the hash of the link’s token', async () => {
    const { token, email } = await aRenterWithALink();
    await sendLinkCode({ token, browserKey: null });
    const code = (await codeMailTo(email)).subject.slice(0, 6);
    const stored = await db()
      .select()
      .from(oneTimeCodes)
      .where(eq(oneTimeCodes.subject, hashToken(token)));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ purpose: 'private_link', linkHash: null });
    const everything = JSON.stringify(stored);
    expect(everything).not.toContain(code);
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(email);
  });

  it('opens the link in the browser that entered the code, for half an hour', async () => {
    const { token, email } = await aRenterWithALink();
    const now = new Date();
    const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
    const sent = await sendLinkCode({ token, browserKey: null }, now);
    if (!('browserKey' in sent)) throw new Error('not sent');
    const code = (await codeMailTo(email)).subject.slice(0, 6);
    const wrong = code === '111111' ? '222222' : '111111';

    expect(await checkLinkCode({ token, browserKey: sent.browserKey, code: wrong }, now)).toEqual({
      result: 'wrong',
    });
    // The right code from another browser opens nothing.
    expect(await checkLinkCode({ token, browserKey: 'c'.repeat(43), code }, now)).toEqual({
      result: 'finished',
    });
    const checked = await checkLinkCode({ token, browserKey: sent.browserKey, code }, later(1));
    if (checked.result !== 'correct') throw new Error('the code was refused');

    expect(LINK_CODE_LASTS_MINUTES).toBe(30);
    expect(linkPassStands(token, checked.pass, later(2))).toBe(true);
    expect(linkPassStands(token, checked.pass, later(30.9))).toBe(true);
    expect(linkPassStands(token, checked.pass, later(31))).toBe(false);
    // The code is used up: asking again means a new code.
    expect(await checkLinkCode({ token, browserKey: sent.browserKey, code }, later(2))).toEqual({
      result: 'finished',
    });
  });

  it('gives a pass for that link only, and one that can’t be made up or stretched', async () => {
    const one = await aRenterWithALink();
    const two = await aRenterWithALink();
    const sent = await sendLinkCode({ token: one.token, browserKey: null });
    if (!('browserKey' in sent)) throw new Error('not sent');
    const code = (await codeMailTo(one.email)).subject.slice(0, 6);
    // A code sent for one link opens no other.
    expect(await checkLinkCode({ token: two.token, browserKey: sent.browserKey, code })).toEqual({
      result: 'finished',
    });
    const checked = await checkLinkCode({ token: one.token, browserKey: sent.browserKey, code });
    if (checked.result !== 'correct') throw new Error('the code was refused');

    expect(linkPassStands(one.token, checked.pass)).toBe(true);
    expect(linkPassStands(two.token, checked.pass)).toBe(false);
    const [expires, signature] = checked.pass.split('.');
    expect(linkPassStands(one.token, `${Number(expires) + 60_000}.${signature}`)).toBe(false);
    for (const pass of [undefined, null, '', 'guess', `${expires}.`, `${expires}.AAAA`]) {
      expect(linkPassStands(one.token, pass)).toBe(false);
    }
    // Each link has its own cookies, named without the token itself.
    expect(linkCodeCookie(one.token)).not.toBe(linkCodeCookie(two.token));
    expect(linkPassCookie(one.token)).toMatch(/^gaff_link_pass_[0-9a-f]{16}$/);
    expect(linkPassCookie(one.token)).not.toContain(one.token);
  });

  it('sends nothing for a link that isn’t a renter’s, or doesn’t work', async () => {
    expect(await sendLinkCode({ token: 'd'.repeat(43), browserKey: null })).toEqual({
      sent: false,
      reason: 'no_link',
    });
    expect(await sendLinkCode({ token: 'not a token', browserKey: null })).toEqual({
      sent: false,
      reason: 'no_link',
    });
  });

  it('keeps the rules of every code: a new one only after 30 seconds', async () => {
    const { token } = await aRenterWithALink();
    const now = new Date();
    const first = await sendLinkCode({ token, browserKey: null }, now);
    if (!('browserKey' in first)) throw new Error('not sent');
    expect(
      await sendLinkCode({ token, browserKey: first.browserKey }, new Date(now.getTime() + 10_000)),
    ).toMatchObject({ sent: false, reason: 'wait' });
    expect(
      await sendLinkCode({ token, browserKey: first.browserKey }, new Date(now.getTime() + 30_000)),
    ).toMatchObject({ sent: true });
  });
});
