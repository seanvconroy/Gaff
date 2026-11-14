import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { memberships, organisations, users } from '@/db/schema';
import { auth } from './auth';

declare const memberBrand: unique symbol;

/**
 * A signed-in person acting for their organisation. Only findMember() creates one, so
 * code that needs a person's authority (decisions, ADR-0007) must start from a session.
 */
export interface Member {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly organisationId: string;
  readonly organisationName: string;
  readonly organisationKind: 'agency' | 'landlord';
  readonly role: 'admin' | 'negotiator';
  readonly [memberBrand]: true;
}

/** The signed-in person and this browser's session, or null. */
export async function currentSession() {
  const requestHeaders = await headers();
  return auth().api.getSession({ headers: requestHeaders });
}

export async function currentUser() {
  // Read the request before anything else: it marks the page as one rendered per request, so
  // the build never tries to render it ahead of time, without the app's settings.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
}

export async function findMember(userId: string): Promise<Member | null> {
  const [row] = await db()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      organisationId: organisations.id,
      organisationName: organisations.name,
      organisationKind: organisations.kind,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt)
    .limit(1);
  return row ? (row as Member) : null;
}

/** For workspace pages: signed out → sign-in; signed in without an organisation → welcome. */
export async function requireMember(): Promise<Member> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const member = await findMember(user.id);
  if (!member) redirect('/welcome');
  return member;
}
