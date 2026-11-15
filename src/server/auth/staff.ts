import { notFound } from 'next/navigation';
import { isStaff } from '@/domain/staff/staff';
import { env } from '@/lib/env';
import { currentUser } from './member';

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

/** For Gaff's internal pages: anyone who isn't staff gets "not found", signed in or not. */
export async function requireStaff(): Promise<Staff> {
  const staff = staffFrom(await currentUser());
  if (!staff) notFound();
  return staff;
}
