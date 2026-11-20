import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, gte, lt, sql } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
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
} from '@/domain/auth/codes';
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
 * - An address gets at most five codes in ten minutes and twenty in a day.
 * - Rows are deleted a day after they're sent, by the retention job (rule 9).
 */
export type CodePurpose = 'sign_in' | 'confirm' | 'private_link';

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
  /** The address the email goes to. */
  to: string;
  /** The key in this browser's cookie, if it has one already. */
  browserKey: string | null;
  /** Writes the email. `link` is the button's address when the email carries one. */
  compose: (code: string, link: string | null) => CodeEmail;
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
  /** The email couldn't be sent. */
  | { sent: false; reason: 'not_sent' };

/** Sends a new code, unless one has just gone or the address has had too many. */
export async function sendCode(input: SendCodeInput, now = new Date()): Promise<SendCodeResult> {
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
  if (!canSendAnother(counts?.inWindow ?? 0, counts?.inDay ?? 0)) {
    return { sent: false, reason: 'too_many' };
  }

  const id = randomUUID();
  const token = input.linkPath ? randomBytes(32).toString('base64url') : null;
  const code = token ? codeForLink(token) : codeFromBytes(randomBytes(32));
  await db()
    .insert(oneTimeCodes)
    .values({
      id,
      purpose: input.purpose,
      subject: input.subject,
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
    await emailSender().send({
      to: input.to,
      from: input.from ?? gaffSender(),
      ...input.compose(code, link),
      idempotencyKey: `code-${id}`,
    });
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
    sentAt: row.sentAt,
    expiresAt: row.expiresAt,
    open: codeStanding(row, now) === 'open',
    attemptId: row.attemptId,
    nextPath: row.nextPath,
  };
}

export type TryCodeResult =
  /** The right code, in the browser that asked for it. It is used up. */
  | { result: 'correct'; subject: string; attemptId: string | null; nextPath: string | null }
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
      return {
        result: 'correct',
        subject: row.subject,
        attemptId: row.attemptId,
        nextPath: row.nextPath,
      };
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
  | { where: 'here'; subject: string; attemptId: string | null; nextPath: string | null }
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
    return {
      where: 'here',
      subject: row.subject,
      attemptId: row.attemptId,
      nextPath: row.nextPath,
    };
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
