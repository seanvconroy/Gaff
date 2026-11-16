import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { confirmCodeEmail } from '@/copy/sign-in';
import { db, type Tx } from '@/db/client';
import { confirmations } from '@/db/schema';
import {
  confirmationExpiry,
  type ConfirmMethod,
  type SensitiveAction,
} from '@/domain/auth/confirm';
import { sendCode, tryCode, type SendCodeResult } from './codes';

/**
 * UX-SI-10: "Confirm it's you again". Three actions ask for it, whatever the age of the session:
 * changing the account tenants pay into, removing a member, and deleting an agency.
 *
 * How it works:
 * 1. The person confirms with a passkey or a fresh email code. That writes a confirmation for
 *    that person and that action, and gives the browser a random grant in an HTTP-only cookie.
 *    Only the grant's hash is stored.
 * 2. The use case that makes the change takes a `Confirmation` and spends it in the same
 *    transaction as the change. It lasts five minutes and works once.
 *
 * To require it for a new action (WP-19's "remove a member", and "delete an agency"):
 * - give the use case a `confirmation: Confirmation | null` argument, and call
 *   `spendConfirmation(tx, confirmation)` inside its transaction, before the change;
 * - in the server action, get it with `confirmationFor(user.id, action)` from
 *   `./confirm-request`, and when the use case says one is needed, return
 *   `{ confirm: action }` to the form;
 * - in the form, show `<ConfirmItsYou>` (src/app/(auth)/confirm) and send the form again when
 *   it calls `onConfirmed`.
 * Settings, "Where tenants pay" (src/server/tenancy/payment.ts) is the worked example.
 *
 * This file needs no request, so integration tests and jobs can use it. Reading and setting the
 * cookie is in `./confirm-request`.
 */

declare const confirmationBrand: unique symbol;

/**
 * Proof that a signed-in person confirmed it's them, just now, for one action. Only
 * `findConfirmation` creates one, so a use case that takes it can't be reached without it.
 */
export interface Confirmation {
  readonly id: string;
  readonly userId: string;
  readonly action: SensitiveAction;
  readonly method: ConfirmMethod;
  readonly [confirmationBrand]: true;
}

/** Nobody has confirmed for this action, or the confirmation has expired or been spent. */
export class ConfirmationNeeded extends Error {
  constructor(readonly action: SensitiveAction) {
    super(`Confirmation needed: ${action}`);
  }
}

const GRANT = /^[A-Za-z0-9_-]{43}$/;
const hashGrant = (grant: string) => createHash('sha256').update(grant).digest('hex');

/** Records that this person confirmed, and returns the grant for their browser's cookie. */
export async function grantConfirmation(
  userId: string,
  action: SensitiveAction,
  method: ConfirmMethod,
  now = new Date(),
): Promise<string> {
  const grant = randomBytes(32).toString('base64url');
  await db()
    .insert(confirmations)
    .values({
      userId,
      action,
      method,
      grantHash: hashGrant(grant),
      confirmedAt: now,
      expiresAt: confirmationExpiry(now),
    });
  return grant;
}

/** The confirmation behind a browser's grant, if it's this person's, for this action, and stands. */
export async function findConfirmation(
  userId: string,
  action: SensitiveAction,
  grant: string | null | undefined,
  now = new Date(),
): Promise<Confirmation | null> {
  if (!grant || !GRANT.test(grant)) return null;
  const [row] = await db()
    .select({ id: confirmations.id, method: confirmations.method })
    .from(confirmations)
    .where(
      and(
        eq(confirmations.grantHash, hashGrant(grant)),
        eq(confirmations.userId, userId),
        eq(confirmations.action, action),
        isNull(confirmations.usedAt),
        gt(confirmations.expiresAt, now),
      ),
    );
  if (!row) return null;
  return { id: row.id, userId, action, method: row.method as ConfirmMethod } as Confirmation;
}

/**
 * Spends a confirmation, in the transaction that makes the change it allows. If it has expired
 * or been spent since it was found, nothing is changed and `ConfirmationNeeded` is thrown.
 */
export async function spendConfirmation(
  tx: Tx,
  confirmation: Confirmation | null,
  action: SensitiveAction,
  userId: string,
  now = new Date(),
): Promise<ConfirmMethod> {
  if (!confirmation || confirmation.action !== action || confirmation.userId !== userId) {
    throw new ConfirmationNeeded(action);
  }
  const [spent] = await tx
    .update(confirmations)
    .set({ usedAt: now })
    .where(
      and(
        eq(confirmations.id, confirmation.id),
        eq(confirmations.userId, userId),
        eq(confirmations.action, action),
        isNull(confirmations.usedAt),
        gt(confirmations.expiresAt, now),
      ),
    )
    .returning({ method: confirmations.method });
  if (!spent) throw new ConfirmationNeeded(action);
  return spent.method as ConfirmMethod;
}

const subjectFor = (userId: string, action: SensitiveAction) => `${userId}:${action}`;

/** Sends a fresh code to the person's own email, to confirm it's them for this action. */
export function sendConfirmationCode(
  user: { id: string; email: string },
  action: SensitiveAction,
  browserKey: string | null,
  now = new Date(),
): Promise<SendCodeResult> {
  return sendCode(
    {
      purpose: 'confirm',
      subject: subjectFor(user.id, action),
      to: user.email,
      browserKey,
      compose: (code) => confirmCodeEmail(code, action),
    },
    now,
  );
}

/** One try at the code. The right one becomes a confirmation, and its grant is returned. */
export async function confirmWithCode(
  user: { id: string },
  action: SensitiveAction,
  browserKey: string | null,
  code: string,
  now = new Date(),
): Promise<{ result: 'correct'; grant: string } | { result: 'wrong' | 'finished' }> {
  const tried = await tryCode(
    { purpose: 'confirm', browserKey, code, subject: subjectFor(user.id, action) },
    now,
  );
  if (tried.result !== 'correct') return { result: tried.result };
  return { result: 'correct', grant: await grantConfirmation(user.id, action, 'email_code', now) };
}

/** Rule 9: confirmations are deleted a day after they expire. Called by the retention job. */
export async function purgeOldConfirmations(tx: Tx, now: Date): Promise<number> {
  const deleted = await tx
    .delete(confirmations)
    .where(lt(confirmations.expiresAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)))
    .returning({ id: confirmations.id });
  return deleted.length;
}
