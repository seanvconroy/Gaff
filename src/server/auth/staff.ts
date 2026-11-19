import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db/client';
import { passkeys } from '@/db/schema';
import { signInMethodFrom } from '@/domain/auth/methods';
import { staffAccess, staffPasskeyRequired, type StaffAccess } from '@/domain/auth/staff-access';
import { isStaff } from '@/domain/staff/staff';
import { env } from '@/lib/env';
import { currentSession } from './member';

declare const staffBrand: unique symbol;

/**
 * One of Gaff's own team, signed in (UX-TS-5). Only staffFrom() creates one, so anything that
 * needs staff (the internal page's queries) must start from a signed-in user on STAFF_EMAILS.
 * Staff see totals across organisations. They get nothing in any operator's workspace (Q13).
 */
export interface Staff {
  readonly userId: string;
  readonly [staffBrand]: true;
}

/** The signed-in user as staff, or null for anyone else, signed in or not. */
export function staffFrom(
  user: { id: string; email: string; emailVerified: boolean } | null | undefined,
): Staff | null {
  if (!user || !isStaff(user, env().STAFF_EMAILS)) return null;
  return { userId: user.id } as Staff;
}

/** Where Gaff's team are sent when their sign-in isn't enough for /internal (BA-8, M5). */
export const STAFF_ADD_PASSKEY = '/profile?need=passkey#profile-sign-in';
export const STAFF_USE_PASSKEY = '/sign-in/staff';

/**
 * BA-8 (the live line's M5): whether this session may open Gaff's own pages. In production,
 * only on a passkey sign-in from the last 8 hours; on the test copy and locally, the email on
 * the list is enough (src/domain/auth/staff-access).
 */
export async function staffAccessOf(
  session: { user: { id: string }; session: { createdAt: Date | string; signInMethod?: unknown } },
  required: boolean = staffPasskeyRequired(env().GAFF_ENV),
  now: Date = new Date(),
): Promise<StaffAccess> {
  if (!required) return 'allowed';
  const [key] = await db()
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.userId, session.user.id))
    .limit(1);
  return staffAccess({
    required,
    method: signInMethodFrom(session.session.signInMethod),
    startedAt: new Date(session.session.createdAt),
    hasPasskey: Boolean(key),
    now,
  });
}

/**
 * For Gaff's internal pages: anyone who isn't staff gets "not found", signed in or not. In
 * production, staff whose sign-in wasn't a recent passkey are sent to add one, or to sign in
 * with the one they have.
 */
export async function requireStaff(): Promise<Staff> {
  const session = await currentSession();
  const staff = staffFrom(session?.user);
  if (!session || !staff) notFound();
  const access = await staffAccessOf(session);
  if (access === 'needs_a_passkey') redirect(STAFF_ADD_PASSKEY);
  if (access === 'needs_passkey_sign_in') redirect(STAFF_USE_PASSKEY);
  return staff;
}
