import { redirect } from 'next/navigation';
import { cache } from 'react';
import { type Context, contextFor } from '@/domain/navigation/context';
import { currentUser, findMember, type Member } from '@/server/auth/member';

/**
 * The signed-in person, and which side of Gaff they're on now: letting or renting. The shell asks
 * this to choose the navigation, and `/` asks it to choose where to land.
 */
export interface CurrentPerson {
  userId: string;
  /** Their name, or their email address until they've given one. */
  name: string;
  email: string;
  /** "Letting or renting?" The rule is `contextFor` (src/domain/navigation/context.ts). */
  context: Context;
  /** Who they let homes for, if anyone. Workspace pages still start from `requireMember()`. */
  member: Member | null;
}

/**
 * Who is signed in, or null. Asked once per request, however many layouts and pages ask.
 *
 * THE CURRENT CONTEXT LIVES HERE. Today a member of an organisation is letting and anyone else is
 * renting. Work package WP-5 replaces that rule with the real switcher (UX-AC-11): change
 * `contextFor`, and what this passes it, and every shell and landing place follows.
 */
export const currentPerson = cache(async (): Promise<CurrentPerson | null> => {
  const user = await currentUser();
  if (!user) return null;
  const member = await findMember(user.id);
  return {
    userId: user.id,
    name: member?.name || user.name || user.email,
    email: user.email,
    context: contextFor({ memberOfAnOrganisation: member !== null }),
    member,
  };
});

/** For pages any signed-in person can open (Profile, Saved, Enquiries): signed out → sign-in. */
export async function requirePerson(): Promise<CurrentPerson> {
  const person = await currentPerson();
  if (!person) redirect('/sign-in');
  return person;
}
