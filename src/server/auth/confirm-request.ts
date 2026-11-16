import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/db/client';
import { passkeys } from '@/db/schema';
import type { SensitiveAction } from '@/domain/auth/confirm';
import { waitingCode, type SendCodeResult, type WaitingCode } from './codes';
import {
  confirmWithCode,
  findConfirmation,
  sendConfirmationCode,
  type Confirmation,
} from './confirm';
import { cookieLifetimes, cookieNames, cookieOptions } from './cookies';

/**
 * UX-SI-10, for server actions: the cookie side of "Confirm it's you again". The rules and the
 * steps to require it for a new action are in ./confirm.
 */

/**
 * The confirmation this browser holds for this person and action, or null if there is none that
 * still stands. Pass it to the use case, which spends it with the change.
 */
export async function confirmationFor(
  userId: string,
  action: SensitiveAction,
): Promise<Confirmation | null> {
  const jar = await cookies();
  return findConfirmation(userId, action, jar.get(cookieNames.confirmed)?.value);
}

/** Emails the signed-in person a fresh code, tied to this browser. */
export async function startConfirmation(
  user: { id: string; email: string },
  action: SensitiveAction,
): Promise<SendCodeResult> {
  const jar = await cookies();
  const result = await sendConfirmationCode(
    user,
    action,
    jar.get(cookieNames.confirmCode)?.value ?? null,
  );
  if ('browserKey' in result) {
    jar.set(cookieNames.confirmCode, result.browserKey, cookieOptions(cookieLifetimes.code));
  }
  return result;
}

/** One try at the emailed code. The right one leaves this browser holding the confirmation. */
export async function finishConfirmation(
  user: { id: string },
  action: SensitiveAction,
  code: string,
): Promise<'correct' | 'wrong' | 'finished'> {
  const jar = await cookies();
  const tried = await confirmWithCode(
    user,
    action,
    jar.get(cookieNames.confirmCode)?.value ?? null,
    code,
  );
  if (tried.result === 'correct') {
    jar.set(cookieNames.confirmed, tried.grant, cookieOptions(cookieLifetimes.confirmed));
    jar.delete(cookieNames.confirmCode);
  }
  return tried.result;
}

/** The code this browser is waiting on to confirm, if any. */
export async function currentConfirmationCode(): Promise<WaitingCode | null> {
  const jar = await cookies();
  return waitingCode('confirm', jar.get(cookieNames.confirmCode)?.value ?? null);
}

/** Once the change is made, the browser's grant has been spent and is forgotten. */
export async function forgetConfirmation(): Promise<void> {
  (await cookies()).delete(cookieNames.confirmed);
}

/** Whether this person has a passkey, so the sheet can offer it before an email code. */
export async function hasPasskey(userId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .limit(1);
  return Boolean(row);
}
