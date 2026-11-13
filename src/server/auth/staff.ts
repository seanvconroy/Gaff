import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db/client';
import { staffMembers, users } from '@/db/schema';
import { currentUser } from './member';

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

/** For staff pages: anyone else gets a "not found", so the pages don't advertise themselves. */
export async function requireStaff(): Promise<Staff> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const staff = await findStaff(user.id);
  if (!staff) notFound();
  return staff;
}
