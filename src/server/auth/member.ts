import { asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '@/db/client';
import { memberships, organisations, users } from '@/db/schema';
import {
  contextsFor,
  lettingContext,
  type LettingContext,
  type PersonContext,
} from '@/domain/navigation/context';
import type { OrganisationKind } from '@/domain/organisations/kinds';
import { type Profile, readProfile } from '@/server/accounts/profile';
import { auth } from './auth';

declare const memberBrand: unique symbol;

/**
 * A signed-in person acting for one organisation they belong to. Only this file creates one, so
 * code that needs a person's authority (decisions, ADR-0007) must start from a session.
 *
 * A person can belong to several organisations (UX-AC-2, ADR-0016): an agency or two, and their
 * own homes. A `Member` is always the person in one of them.
 */
export interface Member {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  /** Whether the email address they sign in with has been verified (UX-AC-14). */
  readonly emailVerified: boolean;
  readonly organisationId: string;
  readonly organisationName: string;
  readonly organisationKind: OrganisationKind;
  readonly role: 'admin' | 'negotiator';
  readonly [memberBrand]: true;
}

export async function currentUser() {
  return (await currentSession())?.user ?? null;
}

/**
 * The signed-in person and this device's session: when it began, and how (BA-8: Gaff's team
 * need a passkey sign-in in production; "Signed-in devices" marks this one).
 */
export async function currentSession() {
  // Read the request before anything else: it marks the page as one rendered per request, so
  // the build never tries to render it ahead of time, without the app's settings.
  const requestHeaders = await headers();
  return auth().api.getSession({ headers: requestHeaders });
}

/** The person in each organisation they belong to, in the order they joined. */
export async function membersOf(userId: string): Promise<Member[]> {
  const rows = await db()
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      organisationId: organisations.id,
      organisationName: organisations.name,
      organisationKind: organisations.kind,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt), asc(organisations.createdAt));
  return rows as Member[];
}

/** What a signed-in person holds: their organisations, their contexts and the one to let for. */
export interface Holdings {
  members: Member[];
  profile: Profile;
  contexts: PersonContext[];
  /** The organisation a workspace page works for (UX-AC-11), or null if they let nothing. */
  letting: LettingContext | null;
  member: Member | null;
}

/** Everything `currentPerson()` and `requireMember()` need to know about one person. */
export async function holdingsOf(userId: string): Promise<Holdings> {
  const [members, profile] = await Promise.all([membersOf(userId), readProfile(userId)]);
  const contexts = contextsFor({
    organisations: members.map((member) => ({
      id: member.organisationId,
      name: member.organisationName,
      kind: member.organisationKind,
    })),
    renting: profile.rentingSince !== null,
  });
  const letting = lettingContext(contexts, {
    side: profile.lastSide,
    organisationId: profile.lastOrganisationId,
  });
  const member = members.find((m) => m.organisationId === letting?.organisationId) ?? null;
  return { members, profile, contexts, letting, member };
}

/** Who is signed in and what they hold, asked once per request however many pages ask. */
export const signedIn = cache(async () => {
  const user = await currentUser();
  return user ? { user, ...(await holdingsOf(user.id)) } : null;
});

/**
 * The person as a member of one organisation: the one named, or else the one they let for now
 * (the organisation they used last, if they belong to more than one).
 */
export async function findMember(userId: string, organisationId?: string): Promise<Member | null> {
  if (organisationId) {
    return (await membersOf(userId)).find((m) => m.organisationId === organisationId) ?? null;
  }
  return (await holdingsOf(userId)).member;
}

/** For workspace pages: signed out → sign-in; signed in and letting nothing → first run. */
export async function requireMember(): Promise<Member> {
  const person = await signedIn();
  if (!person) redirect('/sign-in');
  if (!person.member) redirect('/welcome');
  return person.member;
}
