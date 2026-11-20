import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, gte, lt, sql } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { smsSender } from '@/adapters/sms';
import { db, type Tx } from '@/db/client';
import { oneTimeCodes } from '@/db/schema';
import {
  CODE_LASTS_MINUTES,
  CODE_LENGTH,
  RESEND_AFTER_SECONDS,
  canSendAnother,
  codeExpiry,
  codeFromBytes,
  codeStanding,
  judgeCode,
  type CodeChannel,
} from '@/domain/auth/codes';
import { readJoining, type Joining } from '@/domain/auth/joining';
import { mobileProofStands } from '@/domain/auth/mobile';
import { env } from '@/lib/env';

/**
 * UX-SI-2: one-time codes, stored and sent. One store serves every use of a code: signing in,
 * confirming it's you again (UX-SI-10), and opening a private link's sensitive page (UX-SI-12).
 * The rules (10 minutes, five tries, a new one after 30 seconds) are in src/domain/auth/codes.ts.
 *
 * What keeps a code safe:
 * - The code is never stored and never logged. The row holds a keyed hash of it (HMAC-SHA-256
 *   with a key made from AUTH_SECRET), so the table alone can't be used to work a code out.
 * - A code works only in the browser that asked for it. That browser holds a random key in an
 *   HTTP-only cookie; the row holds the key's hash. A code read out, forwarded or phished is no
 *   use anywhere else.
 * - An address gets at most five codes in ten minutes and twenty in a day; a mobile number, by
 *   text, three and ten (UX-SI-13).
 * - Rows are deleted a day after they're sent, by the retention job (rule 9).
 */
export type CodePurpose = 'sign_in' | 'confirm' | 'private_link';

/** UX-SI-3: where the sign-in email's button points. The route there finishes the sign-in. */
export const SIGN_IN_LINK_PATH = '/sign-in/open';

const BROWSER_KEY = /^[A-Za-z0-9_-]{43}$/;
const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function keyFor(use: string): Buffer {
  return createHmac('sha256', env().AUTH_SECRET).update(`gaff:${use}`).digest();
}

function hashCode(id: string, code: string): string {
  return createHmac('sha256', keyFor('one-time-code')).update(`${id}:${code}`).digest('hex');
}

/**
 * UX-SI-3: the code that goes with an email's button. It is made from the button's token, so the
 * page the button opens can show the code without the code being kept anywhere.
 */
function codeForLink(token: string): string {
  return codeFromBytes(createHmac('sha256', keyFor('code-link')).update(token).digest());
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The browser's key, if what its cookie holds is one. */
export function browserKeyFrom(value: unknown): string | null {
  return typeof value === 'string' && BROWSER_KEY.test(value) ? value : null;
}

export interface CodeEmail {
  subject: string;
  text: string;
}

export interface SendCodeInput {
  purpose: CodePurpose;
  /** Who the code is for: see the `subject` column. */
  subject: string;
  /** The address the email goes to, or the mobile number the text goes to. */
  to: string;
  /** UX-SI-13: `sms` sends a text, written by `text`. An email, written by `compose`, otherwise. */
  channel?: CodeChannel;
  /** Writes the text, for `sms`. It carries no button. */
  text?: (code: string) => string;
  /** UX-SI-14, UX-SI-15: what the right code also joins to the person it signs in. */
  joining?: Joining | null;
  /** The key in this browser's cookie, if it has one already. */
  browserKey: string | null;
  /** Writes the email. `link` is the button's address when the email carries one. */
  compose?: (code: string, link: string | null) => CodeEmail;
  /** UX-SI-3: build the email's button. Its path is given the token as `?t=`. */
  linkPath?: string;
  from?: { name: string; address: string };
  attemptId?: string | null;
  nextPath?: string | null;
}

export type SendCodeResult =
  /** A new code is on its way. Keep `browserKey` in this browser's cookie. */
  | { sent: true; browserKey: string; sentAt: Date }
  /** A code went to this browser less than 30 seconds ago. It still stands. */
  | { sent: false; reason: 'wait'; browserKey: string; sentAt: Date }
  /** This address has had as many codes as it's allowed for now. */
  | { sent: false; reason: 'too_many' }
  /** The email or the text couldn't be sent. */
  | { sent: false; reason: 'not_sent' };

/** Sends a new code, unless one has just gone or the address has had too many. */
export async function sendCode(input: SendCodeInput, now = new Date()): Promise<SendCodeResult> {
  const channel: CodeChannel = input.channel ?? 'email';
  const browserKey = browserKeyFrom(input.browserKey) ?? randomBytes(32).toString('base64url');
  const browserHash = sha256(browserKey);

  const [recent] = await db()
    .select({ sentAt: oneTimeCodes.sentAt, expiresAt: oneTimeCodes.expiresAt })
    .from(oneTimeCodes)
    .where(
      and(
        eq(oneTimeCodes.purpose, input.purpose),
        eq(oneTimeCodes.subject, input.subject),
        eq(oneTimeCodes.browserHash, browserHash),
        gt(oneTimeCodes.sentAt, new Date(now.getTime() - RESEND_AFTER_SECONDS * 1000)),
      ),
    )
    .orderBy(desc(oneTimeCodes.sentAt))
    .limit(1);
  if (recent) return { sent: false, reason: 'wait', browserKey, sentAt: recent.sentAt };

  const windowStart = new Date(now.getTime() - CODE_LASTS_MINUTES * 60_000);
  const [counts] = await db()
    .select({
      inWindow: sql<number>`count(*) filter (where ${oneTimeCodes.sentAt} >= ${windowStart.toISOString()})::int`,
      inDay: sql<number>`count(*)::int`,
    })
    .from(oneTimeCodes)
    .where(
      and(
        eq(oneTimeCodes.purpose, input.purpose),
        eq(oneTimeCodes.subject, input.subject),
        gte(oneTimeCodes.sentAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
  if (!canSendAnother(counts?.inWindow ?? 0, counts?.inDay ?? 0, channel)) {
    return { sent: false, reason: 'too_many' };
  }

  const id = randomUUID();
  // A text carries no button: there's nowhere to press it but the phone it arrived on.
  const token =
    input.linkPath && channel === 'email' ? randomBytes(32).toString('base64url') : null;
  const code = token ? codeForLink(token) : codeFromBytes(randomBytes(32));
  await db()
    .insert(oneTimeCodes)
    .values({
      id,
      purpose: input.purpose,
      subject: input.subject,
      channel,
      joining: input.joining ?? null,
      browserHash,
      codeHash: hashCode(id, code),
      linkHash: token ? sha256(token) : null,
      attemptId: input.attemptId ?? null,
      nextPath: input.nextPath ?? null,
      sentAt: now,
      expiresAt: codeExpiry(now),
    });

  const link = token ? new URL(`${input.linkPath}?t=${token}`, env().APP_URL).toString() : null;
  try {
    if (channel === 'sms') {
      if (!input.text) throw new Error('A code by text needs its words');
      await smsSender().send({ to: input.to, body: input.text(code) });
    } else {
      if (!input.compose) throw new Error('A code by email needs its words');
      await emailSender().send({
        to: input.to,
        from: input.from ?? gaffSender(),
        ...input.compose(code, link),
        idempotencyKey: `code-${id}`,
      });
    }
  } catch {
    // The code can't arrive, so it doesn't count against the address. Nothing about the
    // address or the code goes in the log.
    await db().delete(oneTimeCodes).where(eq(oneTimeCodes.id, id));
    console.error('A one-time code could not be sent.');
    return { sent: false, reason: 'not_sent' };
  }
  return { sent: true, browserKey, sentAt: now };
}

export interface WaitingCode {
  subject: string;
  /** How it was sent: the screen says "email" or "text". */
  channel: CodeChannel;
  /** What the right code also joins (UX-SI-14, UX-SI-15). */
  joining: Joining | null;
  /** When the right code was entered, if it has been. */
  usedAt: Date | null;
  sentAt: Date;
  expiresAt: Date;
  /** Whether it can still be tried. */
  open: boolean;
  attemptId: string | null;
  nextPath: string | null;
}

/** The newest code this browser asked for, for the screen that takes it. */
export async function waitingCode(
  purpose: CodePurpose,
  browserKey: string | null,
  now = new Date(),
): Promise<WaitingCode | null> {
  const key = browserKeyFrom(browserKey);
  if (!key) return null;
  const [row] = await db()
    .select()
    .from(oneTimeCodes)
    .where(and(eq(oneTimeCodes.purpose, purpose), eq(oneTimeCodes.browserHash, sha256(key))))
    .orderBy(desc(oneTimeCodes.sentAt))
    .limit(1);
  if (!row) return null;
  return {
    subject: row.subject,
    channel: channelOf(row.channel),
    joining: readJoining(row.joining),
    usedAt: row.usedAt,
    sentAt: row.sentAt,
    expiresAt: row.expiresAt,
    open: codeStanding(row, now) === 'open',
    attemptId: row.attemptId,
    nextPath: row.nextPath,
  };
}

/** What a code that has just been used up was: who for, how it came, and what it carries. */
export interface UsedCode {
  subject: string;
  channel: CodeChannel;
  joining: Joining | null;
  attemptId: string | null;
  nextPath: string | null;
}

const channelOf = (value: string): CodeChannel => (value === 'sms' ? 'sms' : 'email');

function usedCode(row: typeof oneTimeCodes.$inferSelect): UsedCode {
  return {
    subject: row.subject,
    channel: channelOf(row.channel),
    joining: readJoining(row.joining),
    attemptId: row.attemptId,
    nextPath: row.nextPath,
  };
}

export type TryCodeResult =
  /** The right code, in the browser that asked for it. It is used up. */
  | ({ result: 'correct' } & UsedCode)
  /** Not the code. They may try again. */
  | { result: 'wrong' }
  /** Expired, out of tries, used, or never asked for here. Only a new code will do. */
  | { result: 'finished' };

/**
 * One try at the newest code this browser asked for. Counted and judged in one transaction, so
 * two tries at once can't both be the fifth.
 */
export async function tryCode(
  input: {
    purpose: CodePurpose;
    browserKey: string | null;
    code: string;
    /** When the caller knows who the code must be for (confirming, a private link). */
    subject?: string;
  },
  now = new Date(),
): Promise<TryCodeResult> {
  const key = browserKeyFrom(input.browserKey);
  if (!key) return { result: 'finished' };
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(oneTimeCodes)
      .where(
        and(
          eq(oneTimeCodes.purpose, input.purpose),
          eq(oneTimeCodes.browserHash, sha256(key)),
          input.subject === undefined ? undefined : eq(oneTimeCodes.subject, input.subject),
        ),
      )
      .orderBy(desc(oneTimeCodes.sentAt))
      .limit(1)
      .for('update');
    if (!row) return { result: 'finished' };
    const wellFormed = new RegExp(`^[0-9]{${CODE_LENGTH}}$`).test(input.code);
    const matches = wellFormed && sameHash(hashCode(row.id, input.code), row.codeHash);
    const judgement = judgeCode(row, matches, now);
    if (judgement.result === 'correct') {
      await tx.update(oneTimeCodes).set({ usedAt: now }).where(eq(oneTimeCodes.id, row.id));
      return { result: 'correct', ...usedCode(row) };
    }
    if (judgement.attempts !== row.attempts) {
      await tx
        .update(oneTimeCodes)
        .set({ attempts: judgement.attempts })
        .where(eq(oneTimeCodes.id, row.id));
    }
    return { result: judgement.result };
  });
}

export type OpenLinkResult =
  /** Opened in the browser that asked: the code is used up, as if it had been typed. */
  | ({ where: 'here' } & UsedCode)
  /** Opened anywhere else: show the code, to be typed where they started. */
  | { where: 'elsewhere'; code: string; expiresAt: Date }
  /** Expired, used, or not a button Gaff sent. */
  | { where: 'nowhere' };

/**
 * UX-SI-3: the email's button. In the browser that asked for the code it stands for typing the
 * code. Anywhere else it only shows the code, and uses nothing up, so an email scanner that
 * follows the link, or a person on their phone, changes nothing for the browser that's waiting.
 */
export async function openCodeLink(
  input: { purpose: CodePurpose; token: string; browserKey: string | null },
  now = new Date(),
): Promise<OpenLinkResult> {
  if (!LINK_TOKEN.test(input.token)) return { where: 'nowhere' };
  const key = browserKeyFrom(input.browserKey);
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(oneTimeCodes)
      .where(
        and(
          eq(oneTimeCodes.purpose, input.purpose),
          eq(oneTimeCodes.linkHash, sha256(input.token)),
        ),
      )
      .limit(1)
      .for('update');
    if (!row || codeStanding(row, now) !== 'open') return { where: 'nowhere' };
    if (!key || sha256(key) !== row.browserHash) {
      return { where: 'elsewhere', code: codeForLink(input.token), expiresAt: row.expiresAt };
    }
    await tx.update(oneTimeCodes).set({ usedAt: now }).where(eq(oneTimeCodes.id, row.id));
    return { where: 'here', ...usedCode(row) };
  });
}

/**
 * UX-SI-14: the mobile number this browser has proved and not yet put an email to. It stands for
 * 15 minutes from the right code by text, for as long as that text (or the email code that
 * followed it, carrying the number) is the newest sign-in code this browser asked for. Nothing
 * else is kept to say so: the used code's row is the proof, and it's deleted with the rest.
 */
export async function provenMobile(
  browserKey: string | null,
  now = new Date(),
): Promise<{ mobile: string; attemptId: string | null; nextPath: string | null } | null> {
  const key = browserKeyFrom(browserKey);
  if (!key) return null;
  const rows = await db()
    .select()
    .from(oneTimeCodes)
    .where(and(eq(oneTimeCodes.purpose, 'sign_in'), eq(oneTimeCodes.browserHash, sha256(key))))
    .orderBy(desc(oneTimeCodes.sentAt))
    .limit(CODES_KEPT_IN_VIEW);
  // Newest first: past the email codes this number has been carried on, to the text itself.
  for (const row of rows) {
    if (row.channel === 'sms') {
      if (!row.usedAt || !mobileProofStands(row.usedAt, now)) return null;
      return { mobile: row.subject, attemptId: row.attemptId, nextPath: row.nextPath };
    }
    const carried = readJoining(row.joining)?.mobile;
    // An email code that carries nothing, or has let someone in: the number's turn is over.
    if (!carried || row.usedAt) return null;
  }
  return null;
}

/** More codes than one address can be sent in ten minutes, each way: enough to look back over. */
const CODES_KEPT_IN_VIEW = 12;

/**
 * UX-SI-15: where to go after signing in, for a code that was sent before that was known (the
 * one that goes out as Google or Apple comes back). Only for this browser's newest open code.
 */
export async function noteWhereNext(
  browserKey: string | null,
  where: { attemptId: string | null; nextPath: string | null },
  now = new Date(),
): Promise<void> {
  const key = browserKeyFrom(browserKey);
  if (!key) return;
  await db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(oneTimeCodes)
      .where(and(eq(oneTimeCodes.purpose, 'sign_in'), eq(oneTimeCodes.browserHash, sha256(key))))
      .orderBy(desc(oneTimeCodes.sentAt))
      .limit(1)
      .for('update');
    if (!row || codeStanding(row, now) !== 'open' || !readJoining(row.joining)?.provider) return;
    await tx
      .update(oneTimeCodes)
      .set({ attemptId: where.attemptId, nextPath: where.nextPath })
      .where(eq(oneTimeCodes.id, row.id));
  });
}

/** Rule 9: codes are deleted a day after they're sent. Called by the retention job. */
export async function purgeOldCodes(tx: Tx, now: Date): Promise<number> {
  const deleted = await tx
    .delete(oneTimeCodes)
    .where(lt(oneTimeCodes.sentAt, new Date(now.getTime() - DAY_MS)))
    .returning({ id: oneTimeCodes.id });
  return deleted.length;
}
