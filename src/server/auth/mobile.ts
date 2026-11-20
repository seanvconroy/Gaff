import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { signInMobiles } from '@/db/schema';
import { SIGN_IN_TEXTS_WINDOW_SECONDS } from '@/domain/auth/limits';
import { mobileSignInMode, mobileStillVouches, type MobileSignInMode } from '@/domain/auth/mobile';
import { env, type Env } from '@/lib/env';
import { provenMobile } from './codes';
import { countTry, triesSoFar } from './limits';
import { noteSignInChangeAfter } from './security';

/**
 * UX-SI-13, UX-SI-14 (ADR-0032): the mobile number a person signs in with. Who has a number,
 * whether it still vouches for them, and joining one to a person who has just proved both the
 * number (a code by text) and their email (a code by email, in the same browser).
 */

/** Whether sign-in by mobile is offered here: see src/domain/auth/mobile.ts. */
export function mobileSignIn(config: Env = env()): MobileSignInMode {
  if (config.SIGN_IN_TEXTS_PER_HOUR === 0) return 'off';
  return mobileSignInMode({
    smsProvider: config.SMS_PROVIDER,
    devTools: config.DEV_TOOLS,
    gaffEnv: config.GAFF_ENV,
  });
}

/**
 * The hour's budget of sign-in texts for the whole of Gaff (`SIGN_IN_TEXTS_PER_HOUR`). It stops
 * a script running up texts, whatever addresses and numbers it uses: past it, sign-in by mobile
 * asks for an email until the hour is out. Only texts that were really sent count.
 */
export async function textBudgetSpent(now = new Date()): Promise<boolean> {
  const sent = await triesSoFar('texts', 'sign_in', SIGN_IN_TEXTS_WINDOW_SECONDS, now);
  return sent >= env().SIGN_IN_TEXTS_PER_HOUR;
}

/** A sign-in text went: one more against the hour's budget. */
export async function textSent(now = new Date()): Promise<void> {
  const counted = await countTry('texts', 'sign_in', SIGN_IN_TEXTS_WINDOW_SECONDS, now);
  // Said once an hour, with nothing about anyone: someone on Gaff's team should look.
  if (counted.hits === env().SIGN_IN_TEXTS_PER_HOUR) {
    console.error('Sign-in texts have reached the hour’s budget. Sign-in by mobile is paused.');
  }
}

/** The person a number gets in by itself: its owner, if it has vouched for them lately. */
export async function personSignedInBy(mobile: string, now = new Date()): Promise<string | null> {
  const [row] = await db().select().from(signInMobiles).where(eq(signInMobiles.mobile, mobile));
  return row && mobileStillVouches(row.provenAt, now) ? row.userId : null;
}

/**
 * UX-SI-14: the number this browser has proved by text that still needs its email: one that got
 * nobody in. A number that signed its owner in a moment ago is not waiting for anything.
 */
export async function mobileNeedingEmail(browserKey: string | null, now = new Date()) {
  const proven = await provenMobile(browserKey, now);
  if (!proven || (await personSignedInBy(proven.mobile, now))) return null;
  return proven;
}

/** A code by text has just signed this person in: their number vouches for them from now. */
export async function mobileProvedAgain(userId: string, now = new Date()): Promise<void> {
  await db().update(signInMobiles).set({ provenAt: now }).where(eq(signInMobiles.userId, userId));
}

/** The number a person signs in with, if they have one. */
export async function signInMobileOf(userId: string): Promise<string | null> {
  const [row] = await db()
    .select({ mobile: signInMobiles.mobile })
    .from(signInMobiles)
    .where(eq(signInMobiles.userId, userId));
  return row?.mobile ?? null;
}

/**
 * UX-SI-14: joins a number to the person who has just proved it and their email. A number has
 * one owner: if someone else had it (and hadn't used it in 180 days, or it would have signed
 * them in), it leaves them, and they're told by email. A person has one number: this replaces
 * the one they had.
 *
 * `quiet` is for a person made in this same sign-in: there's no change to tell them about.
 */
export async function joinMobile(
  userId: string,
  mobile: string,
  options: { quiet?: boolean } = {},
  now = new Date(),
): Promise<'joined' | 'already'> {
  const outcome = await db().transaction(async (tx) => {
    const [mine] = await tx
      .select()
      .from(signInMobiles)
      .where(eq(signInMobiles.userId, userId))
      .for('update');
    if (mine?.mobile === mobile) {
      await tx.update(signInMobiles).set({ provenAt: now }).where(eq(signInMobiles.userId, userId));
      return { was: 'already' as const, lostBy: [] as string[] };
    }
    const lost = await tx
      .delete(signInMobiles)
      .where(and(eq(signInMobiles.mobile, mobile), ne(signInMobiles.userId, userId)))
      .returning({ userId: signInMobiles.userId });
    await tx
      .insert(signInMobiles)
      .values({ userId, mobile, provenAt: now })
      .onConflictDoUpdate({
        target: signInMobiles.userId,
        set: { mobile, provenAt: now, createdAt: now },
      });
    return { was: 'joined' as const, lostBy: lost.map((row) => row.userId) };
  });
  for (const previous of outcome.lostBy) await noteSignInChangeAfter(previous, 'removed', 'mobile');
  if (outcome.was === 'joined' && !options.quiet) {
    await noteSignInChangeAfter(userId, 'added', 'mobile');
  }
  return outcome.was;
}
