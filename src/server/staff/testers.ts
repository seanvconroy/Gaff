import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { withSystem } from '@/db/client';
import { staffMembers, users } from '@/db/schema';
import { env } from '@/lib/env';
import type { Staff } from '@/server/auth/staff';
import { recordPlatformEvent } from '@/server/record/platform-events';

/**
 * The test copy only: testers are Gaff staff, so they can open the outbox, work the check and
 * review queues, and see the whole journey. Production adds staff with `pnpm staff:add`.
 */
export function testersAllowed(): boolean {
  return env().GAFF_ENV !== 'production';
}

/** TEST_STAFF_EMAILS: exact addresses, so "you+renter@" stays an ordinary account. */
export function isListedTester(email: string, list: string | undefined): boolean {
  const wanted = email.trim().toLowerCase();
  return (list ?? '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry !== '' && entry === wanted);
}

/** Runs after every sign-in: someone in TEST_STAFF_EMAILS becomes an admin on the test copy. */
export async function makeListedTesterStaff(
  userId: string,
  config: { gaffEnv: string; list: string | undefined } = {
    gaffEnv: env().GAFF_ENV,
    list: env().TEST_STAFF_EMAILS,
  },
): Promise<void> {
  if (config.gaffEnv === 'production' || !config.list) return;
  await withSystem(async (tx) => {
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
    if (!user || !isListedTester(user.email, config.list)) return;
    const added = await tx
      .insert(staffMembers)
      .values({ userId, role: 'admin' })
      .onConflictDoNothing()
      .returning({ userId: staffMembers.userId });
    if (added.length === 0) return;
    await recordPlatformEvent(tx, {
      type: 'staff.added',
      actor: { type: 'system' },
      data: { role: 'admin', testCopy: true },
    });
  });
}

export async function listTesters(admin: Staff) {
  if (!testersAllowed() || admin.role !== 'admin') return [];
  return withSystem((tx) =>
    tx
      .select({
        userId: staffMembers.userId,
        name: users.name,
        email: users.email,
        role: staffMembers.role,
      })
      .from(staffMembers)
      .innerJoin(users, eq(users.id, staffMembers.userId))
      .orderBy(asc(staffMembers.createdAt)),
  );
}

export const addTesterInput = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  role: z.enum(['reviewer', 'admin']),
});

/** An admin makes someone with an account a tester. They sign in once first. */
export async function addTester(
  admin: Staff,
  input: z.infer<typeof addTesterInput>,
): Promise<'added' | 'no_account' | 'not_allowed'> {
  if (!testersAllowed() || admin.role !== 'admin') return 'not_allowed';
  return withSystem(async (tx) => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email));
    if (!user) return 'no_account';
    await tx
      .insert(staffMembers)
      .values({ userId: user.id, role: input.role })
      .onConflictDoUpdate({ target: staffMembers.userId, set: { role: input.role } });
    await recordPlatformEvent(tx, {
      type: 'staff.added',
      actor: { type: 'person', userId: admin.userId },
      data: { role: input.role, testCopy: true },
    });
    return 'added';
  });
}

/** An admin stops someone being a tester. Never themselves, so the test copy keeps an admin. */
export async function removeTester(
  admin: Staff,
  userId: string,
): Promise<'removed' | 'not_allowed'> {
  if (!testersAllowed() || admin.role !== 'admin' || userId === admin.userId) {
    return 'not_allowed';
  }
  return withSystem(async (tx) => {
    const removed = await tx
      .delete(staffMembers)
      .where(eq(staffMembers.userId, userId))
      .returning({ userId: staffMembers.userId });
    if (removed.length === 0) return 'not_allowed';
    await recordPlatformEvent(tx, {
      type: 'staff.removed',
      actor: { type: 'person', userId: admin.userId },
      data: { testCopy: true },
    });
    return 'removed';
  });
}
