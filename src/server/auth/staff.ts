import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db/client';
import { passkeys, staffMembers, users } from '@/db/schema';
import { signInMethods, type SignInMethod } from '@/domain/auth/sign-in-methods';
import { staffAccess, type StaffAccess } from '@/domain/auth/staff-access';
import { env } from '@/lib/env';
import { currentSession } from './member';

declare const staffBrand: unique symbol;

/**
 * A signed-in member of Gaff's own team. Only findStaff() creates one, and only withStaff()
 * gives staff their wider view (ADR-0017). Staff never see renters' details here.
 */
export interface Staff {
  readonly userId: string;
  readonly name: string;
  readonly role: 'reviewer' | 'admin';
  readonly [staffBrand]: true;
}

export async function findStaff(userId: string): Promise<Staff | null> {
  const [row] = await db()
    .select({ userId: staffMembers.userId, name: users.name, role: staffMembers.role })
    .from(staffMembers)
    .innerJoin(users, eq(users.id, staffMembers.userId))
    .where(eq(staffMembers.userId, userId));
  return row ? (row as Staff) : null;
}

/**
 * M5: whether Gaff's staff must have signed in with a passkey. In production only: on the test
 * copy the founders' testers are staff, and sign in like anyone else.
 */
export function staffPasskeyRequired(gaffEnv: string = env().GAFF_ENV): boolean {
  return gaffEnv === 'production';
}

/** Where staff tools send someone whose sign-in isn't enough for them (M5). */
export const STAFF_HOME = '/staff/checks';
export const STAFF_ADD_PASSKEY = '/account/security?need=passkey';
export const STAFF_USE_PASSKEY = `/account/confirm?with=passkey&next=${encodeURIComponent(STAFF_HOME)}`;

const asMethod = (value: unknown): SignInMethod | null =>
  (signInMethods as readonly unknown[]).includes(value) ? (value as SignInMethod) : null;

/** M5: whether this session may open Gaff's own tools (src/domain/auth/staff-access). */
export async function staffAccessOf(
  session: {
    user: { id: string };
    session: { createdAt: Date | string; signInMethod?: string | null };
  },
  required: boolean = staffPasskeyRequired(),
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
    method: asMethod(session.session.signInMethod),
    startedAt: new Date(session.session.createdAt),
    hasPasskey: Boolean(key),
    now,
  });
}

/**
 * For staff pages and actions: anyone else gets a "not found", so the pages don't advertise
 * themselves. In production, staff get in only on a passkey sign-in from the last 8 hours (M5):
 * otherwise they're sent to add a passkey, or to sign in with the one they have.
 */
export async function requireStaff(): Promise<Staff> {
  const session = await currentSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(STAFF_HOME)}`);
  const staff = await findStaff(session.user.id);
  if (!staff) notFound();
  const access = await staffAccessOf(session);
  if (access === 'needs_a_passkey') redirect(STAFF_ADD_PASSKEY);
  if (access === 'needs_passkey_sign_in') redirect(STAFF_USE_PASSKEY);
  return staff;
}
