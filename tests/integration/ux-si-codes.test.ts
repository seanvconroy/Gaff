import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, withSystem } from '@/db/client';
import { devOutbox, oneTimeCodes } from '@/db/schema';
import { signInCodeEmail } from '@/copy/sign-in';
import {
  openCodeLink,
  purgeOldCodes,
  sendCode,
  tryCode,
  waitingCode,
  type SendCodeInput,
} from '@/server/auth/codes';

/** UX-SI-2, UX-SI-3: one-time codes, as they are stored, sent and tried. Made-up addresses only. */
const anEmail = () => `${randomUUID()}@test.gaff.ie`;
// An hour from now, on the hour. Never a fixed date: the retention sweep that another test file
// runs with the real time deletes every code sent over a day ago, and took these with it.
const at = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 3_600_000);
const after = (seconds: number) => new Date(at.getTime() + seconds * 1000);
const wrong = (code: string) => (code === '111111' ? '222222' : '111111');

/** Sends a sign-in code and gives back what the person would hold: the code, the button, the key. */
async function send(email: string, overrides: Partial<SendCodeInput> = {}, now = at) {
  let code = '';
  let link: string | null = null;
  const result = await sendCode(
    {
      purpose: 'sign_in',
      subject: email,
      to: email,
      browserKey: null,
      linkPath: '/sign-in/open',
      compose: (sentCode, sentLink) => {
        code = sentCode;
        link = sentLink;
        return signInCodeEmail(sentCode, sentLink);
      },
      ...overrides,
    },
    now,
  );
  const token = link ? new URL(link).searchParams.get('t')! : '';
  return { result, code, link: link as string | null, token };
}

const storedFor = (email: string) =>
  db().select().from(oneTimeCodes).where(eq(oneTimeCodes.subject, email));

afterEach(() => vi.restoreAllMocks());

describe('UX-SI-2: a code is stored hashed, and never logged', () => {
  it('keeps a keyed hash of the code, and nothing the code could be read from', async () => {
    const email = anEmail();
    const { result, code, token } = await send(email);
    expect(result.sent).toBe(true);
    expect(code).toMatch(/^\d{6}$/);
    const [row] = await storedFor(email);
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    // Not the code, and not a plain hash of it that a table of a million guesses would undo.
    const { createHash } = await import('node:crypto');
    expect(row!.codeHash).not.toBe(createHash('sha256').update(code).digest('hex'));
    const everything = JSON.stringify(row);
    expect(everything).not.toContain(code);
    // The button's token and the browser's key are kept as hashes too.
    expect(everything).not.toContain(token);
    if (result.sent) expect(everything).not.toContain(result.browserKey);
    expect(row!.linkHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.browserHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never writes a code, a button or an address to the log, whatever happens', async () => {
    const logged: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
    const email = anEmail();
    const sent = await send(email);
    const key = sent.result.sent ? sent.result.browserKey : null;
    await tryCode({ purpose: 'sign_in', browserKey: key, code: wrong(sent.code) }, after(5));
    await openCodeLink({ purpose: 'sign_in', token: sent.token, browserKey: null }, after(6));
    await tryCode({ purpose: 'sign_in', browserKey: key, code: sent.code }, after(7));
    // An email that can't be sent is logged as that, and no more.
    const bounced = `${randomUUID()}@undeliverable.gaff.test`;
    const failed = await send(bounced);
    expect(failed.result).toEqual({ sent: false, reason: 'not_sent' });

    const all = logged.join('\n');
    expect(all).toContain('A one-time code could not be sent.');
    for (const secret of [sent.code, sent.token, email, bounced, failed.code, '@']) {
      expect(all).not.toContain(secret);
    }
    // Rule 8: nothing about a code reaches the record or the funnels.
    const { rows } = await withSystem((tx) =>
      tx.execute(sql`
        select 1 from events where data::text like ${`%${sent.code}%`}
        union all select 1 from funnel_events where data::text like ${`%${sent.code}%`}`),
    );
    expect(rows).toEqual([]);
  });

  it('doesn’t count an email that couldn’t be sent', async () => {
    const bounced = `${randomUUID()}@undeliverable.gaff.test`;
    expect((await send(bounced)).result).toEqual({ sent: false, reason: 'not_sent' });
    expect(await storedFor(bounced)).toEqual([]);
  });
});

describe('UX-SI-2: a code lasts 10 minutes and allows five tries', () => {
  it('signs in with the right code, once', async () => {
    const email = anEmail();
    const sent = await send(email);
    const key = sent.result.sent ? sent.result.browserKey : null;
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: key, code: sent.code }, after(60)),
    ).toMatchObject({ result: 'correct', subject: email });
    // Used up: the same code again is finished.
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: key, code: sent.code }, after(61)),
    ).toEqual({ result: 'finished' });
  });

  it('refuses the right code once ten minutes have passed', async () => {
    const sent = await send(anEmail());
    const key = sent.result.sent ? sent.result.browserKey : null;
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: key, code: sent.code }, after(600)),
    ).toEqual({ result: 'finished' });
  });

  it('says “wrong” four times, and the fifth wrong try finishes the code', async () => {
    const email = anEmail();
    const sent = await send(email);
    const key = sent.result.sent ? sent.result.browserKey : null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      expect(
        await tryCode({ purpose: 'sign_in', browserKey: key, code: wrong(sent.code) }, after(10)),
      ).toEqual({ result: 'wrong' });
    }
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: key, code: wrong(sent.code) }, after(11)),
    ).toEqual({ result: 'finished' });
    // Even the right code is no good now.
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: key, code: sent.code }, after(12)),
    ).toEqual({ result: 'finished' });
    expect((await storedFor(email))[0]).toMatchObject({ attempts: 5, usedAt: null });
  });

  it('counts tries that arrive together, so two can’t both be the fifth', async () => {
    const email = anEmail();
    const sent = await send(email);
    const key = sent.result.sent ? sent.result.browserKey : null;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        tryCode({ purpose: 'sign_in', browserKey: key, code: wrong(sent.code) }, after(10)),
      ),
    );
    expect(results.filter((r) => r.result === 'wrong')).toHaveLength(4);
    expect(results.filter((r) => r.result === 'finished')).toHaveLength(4);
    expect((await storedFor(email))[0]!.attempts).toBe(5);
  });

  it('takes only six digits as a try at all', async () => {
    const sent = await send(anEmail());
    const key = sent.result.sent ? sent.result.browserKey : null;
    for (const code of ['', '12345', `${sent.code}0`, ` ${sent.code}`]) {
      expect(await tryCode({ purpose: 'sign_in', browserKey: key, code }, after(5))).toEqual({
        result: 'wrong',
      });
    }
  });
});

describe('UX-SI-2: a code works only in the browser that asked for it', () => {
  it('is no use in another browser, and trying it there uses nothing up', async () => {
    const email = anEmail();
    const mine = await send(email);
    const myKey = mine.result.sent ? mine.result.browserKey : null;
    // Someone else, in their own browser, asks for a code for the same address...
    const theirs = await send(email, {}, after(1));
    const theirKey = theirs.result.sent ? theirs.result.browserKey : null;
    expect(theirKey).not.toBe(myKey);
    // ...and types the code that came for me. It isn't the code for their browser.
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: theirKey, code: mine.code }, after(5)),
    ).toEqual({ result: 'wrong' });
    // With no key at all, there is no code to try.
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: null, code: mine.code }, after(5)),
    ).toEqual({ result: 'finished' });
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: 'not-a-key', code: mine.code }, after(5)),
    ).toEqual({ result: 'finished' });
    // Mine still works, where I asked for it.
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: myKey, code: mine.code }, after(6)),
    ).toMatchObject({ result: 'correct' });
  });

  it('is for one purpose: a sign-in code confirms nothing else', async () => {
    const sent = await send(anEmail());
    const key = sent.result.sent ? sent.result.browserKey : null;
    expect(
      await tryCode({ purpose: 'confirm', browserKey: key, code: sent.code }, after(5)),
    ).toEqual({ result: 'finished' });
    expect(
      await tryCode({ purpose: 'private_link', browserKey: key, code: sent.code }, after(5)),
    ).toEqual({ result: 'finished' });
  });
});

describe('UX-SI-2: “Send a new code” unlocks after 30 seconds', () => {
  it('sends nothing new for 30 seconds: the code that went still stands', async () => {
    const email = anEmail();
    const first = await send(email);
    const key = first.result.sent ? first.result.browserKey : null;
    for (const seconds of [1, 29]) {
      const again = await send(email, { browserKey: key }, after(seconds));
      expect(again.result).toEqual({ sent: false, reason: 'wait', browserKey: key, sentAt: at });
    }
    expect(await storedFor(email)).toHaveLength(1);
    expect(
      await db().select({ id: devOutbox.id }).from(devOutbox).where(eq(devOutbox.toAddress, email)),
    ).toHaveLength(1);
  });

  it('sends a new one at 30 seconds, and only the new one works', async () => {
    const email = anEmail();
    const first = await send(email);
    const key = first.result.sent ? first.result.browserKey : null;
    const second = await send(email, { browserKey: key }, after(30));
    expect(second.result).toMatchObject({ sent: true, browserKey: key });
    expect(second.code).toMatch(/^\d{6}$/);
    if (second.code !== first.code) {
      expect(
        await tryCode({ purpose: 'sign_in', browserKey: key, code: first.code }, after(31)),
      ).toEqual({ result: 'wrong' });
    }
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: key, code: second.code }, after(32)),
    ).toMatchObject({ result: 'correct' });
    // The screen that takes the code knows which one it's waiting on.
    expect(await waitingCode('sign_in', key, after(33))).toMatchObject({
      subject: email,
      sentAt: after(30),
      open: false,
    });
  });

  it('sends one address five codes in ten minutes and no more, whoever asks', async () => {
    const email = anEmail();
    for (let n = 0; n < 5; n++) {
      expect((await send(email, {}, after(n * 60))).result.sent).toBe(true);
    }
    expect((await send(email, {}, after(5 * 60))).result).toEqual({
      sent: false,
      reason: 'too_many',
    });
    // Another address is none the worse.
    expect((await send(anEmail(), {}, after(5 * 60))).result.sent).toBe(true);
    // Ten minutes after the first, there's room for one more.
    expect((await send(email, {}, after(10 * 60 + 1))).result.sent).toBe(true);
  });

  it('sends one address twenty codes in a day and no more', async () => {
    const email = anEmail();
    for (let n = 0; n < 20; n++) {
      expect((await send(email, {}, after(n * 180))).result.sent).toBe(true);
    }
    expect((await send(email, {}, after(20 * 180))).result).toEqual({
      sent: false,
      reason: 'too_many',
    });
    expect((await send(email, {}, after(24 * 60 * 60 + 1))).result.sent).toBe(true);
  });
});

describe('UX-SI-3: the email’s button', () => {
  it('is in the email with the code, and carries no address', async () => {
    const email = anEmail();
    const { code, link } = await send(email);
    expect(link!.startsWith(`${process.env.APP_URL}/sign-in/open?t=`)).toBe(true);
    expect(new URL(link!).searchParams.get('t')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [mail] = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, email));
    expect(mail!.subject).toBe(`${code} is your code to sign in to Gaff`);
    expect(mail!.text).toContain(code);
    expect(mail!.text).toContain(link!);
    expect(link).not.toContain('@');
  });

  it('opened anywhere else, shows the code and uses nothing up', async () => {
    const email = anEmail();
    const sent = await send(email);
    const key = sent.result.sent ? sent.result.browserKey : null;
    // No key (a phone), or another browser's key: the code, and nobody signed in.
    for (const browserKey of [null, 'a'.repeat(43)]) {
      expect(
        await openCodeLink({ purpose: 'sign_in', token: sent.token, browserKey }, after(30)),
      ).toEqual({ where: 'elsewhere', code: sent.code, expiresAt: after(600) });
    }
    expect((await storedFor(email))[0]).toMatchObject({ attempts: 0, usedAt: null });
    // Typed where they started, it works.
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: key, code: sent.code }, after(40)),
    ).toMatchObject({ result: 'correct' });
    // Once the code is used, the button shows nothing.
    expect(
      await openCodeLink({ purpose: 'sign_in', token: sent.token, browserKey: null }, after(50)),
    ).toEqual({ where: 'nowhere' });
  });

  it('opened in the browser that asked, stands for typing the code, once', async () => {
    const email = anEmail();
    const sent = await send(email, { attemptId: randomUUID(), nextPath: '/settings' });
    const key = sent.result.sent ? sent.result.browserKey : null;
    expect(
      await openCodeLink({ purpose: 'sign_in', token: sent.token, browserKey: key }, after(30)),
    ).toMatchObject({ where: 'here', subject: email, nextPath: '/settings' });
    expect(
      await openCodeLink({ purpose: 'sign_in', token: sent.token, browserKey: key }, after(31)),
    ).toEqual({ where: 'nowhere' });
    expect(
      await tryCode({ purpose: 'sign_in', browserKey: key, code: sent.code }, after(32)),
    ).toEqual({ result: 'finished' });
  });

  it('shows nothing after ten minutes, or for a token Gaff never sent', async () => {
    const sent = await send(anEmail());
    const key = sent.result.sent ? sent.result.browserKey : null;
    expect(
      await openCodeLink({ purpose: 'sign_in', token: sent.token, browserKey: key }, after(600)),
    ).toEqual({ where: 'nowhere' });
    for (const token of ['', 'short', 'b'.repeat(43), `${sent.token}x`]) {
      expect(await openCodeLink({ purpose: 'sign_in', token, browserKey: key }, after(5))).toEqual({
        where: 'nowhere',
      });
    }
  });
});

describe('UX-SI-2: codes are deleted by the retention job (rule 9)', () => {
  it('deletes a code a day after it was sent, and not before', async () => {
    const old = anEmail();
    const recent = anEmail();
    await send(old, {}, at);
    await send(recent, {}, after(60 * 60));
    await withSystem((tx) => purgeOldCodes(tx, after(24 * 60 * 60 + 1)));
    expect(await storedFor(old)).toEqual([]);
    expect(await storedFor(recent)).toHaveLength(1);
  });
});
