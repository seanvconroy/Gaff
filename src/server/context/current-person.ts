import { redirect } from 'next/navigation';
import { nameIsKnown } from '@/domain/accounts/first-run';
import {
  currentContext,
  type LettingContext,
  type PersonContext,
} from '@/domain/navigation/context';
import type { Side } from '@/domain/navigation/destinations';
import { type Member, signedIn } from '@/server/auth/member';

/**
 * The signed-in person: one person, whatever they do on Gaff (UX-AC-1, ADR-0016). The shell
 * asks this to choose the navigation, and `/` asks it to choose where to land.
 */
export interface CurrentPerson {
  userId: string;
  /** Their name, or their email address until they've given one. */
  name: string;
  /** Whether they've given a name, or sign-in supplied one. */
  nameKnown: boolean;
  email: string;
  /**
   * UX-AC-11: every context they have: each organisation they belong to (an agency by name, or
   * "My own homes") and "Renting". The rules are in src/domain/navigation/context.ts.
   */
  contexts: PersonContext[];
  /** The context that is open: the one they used last. Null until first run gives them one. */
  context: PersonContext | null;
  /** The side that's open, for the navigation. Null until they have a context. */
  side: Side | null;
  /**
   * The organisation a workspace page works for, and the person as its member: the open context
   * if it's on the letting side, else the organisation they let for last. Null if they let
   * nothing. Workspace pages still start from `requireMember()`.
   */
  letting: LettingContext | null;
  member: Member | null;
}

/**
 * Who is signed in, or null. Asked once per request, however many layouts and pages ask.
 *
 * WHERE CONTEXTS LIVE. What a person holds comes from their memberships and their own profile
 * (`holdingsOf` in src/server/auth/member.ts). Which one is open is `currentContext`, from what
 * their profile remembers (`lastSide`, `lastOrganisationId`). It changes in one place:
 * src/server/accounts/contexts.ts (`switchContext`, and the use cases that add a context).
 */
export async function currentPerson(): Promise<CurrentPerson | null> {
  const person = await signedIn();
  if (!person) return null;
  const { user, profile, contexts, letting, member } = person;
  const context = currentContext(contexts, {
    side: profile.lastSide,
    organisationId: profile.lastOrganisationId,
  });
  return {
    userId: user.id,
    name: nameIsKnown(user.name) ? user.name : user.email,
    nameKnown: nameIsKnown(user.name),
    email: user.email,
    contexts,
    context,
    side: context?.side ?? null,
    letting,
    member,
  };
}

/** For pages any signed-in person can open (Profile, Saved, Enquiries): signed out → sign-in. */
export async function requirePerson(): Promise<CurrentPerson> {
  const person = await currentPerson();
  if (!person) redirect('/sign-in');
  return person;
}
