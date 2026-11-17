import { and, eq, sql } from 'drizzle-orm';
import { db, scopeToPerson, type Tx, withPerson } from '@/db/client';
import { memberships, organisations, users } from '@/db/schema';
import { firstNameOf, nameIsKnown, nameSchema, purposeFromNext } from '@/domain/accounts/first-run';
import { homeFor, RENTING } from '@/domain/navigation/context';
import { holdingsOf } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordFunnelStep } from '@/server/funnels/steps';
import { carryIdentityToOwnHomes } from '@/server/identity/kept';
import { createOrganisationIn } from '@/server/organisations/create-organisation';
import { profileIn, saveProfileIn } from './profile';

/**
 * UX-AC-2, UX-AC-11 to UX-AC-13 (ADR-0016): what a person does to their own contexts: adding
 * one, and switching between the ones they have. Every function here takes the signed-in
 * person themselves (`currentUser()`), and changes nothing of anybody else's.
 *
 * THE OPEN CONTEXT CHANGES HERE, and in ./agencies.ts when someone joins or sets up an agency:
 * the person's profile remembers the side and the organisation they used last.
 */
export interface SignedInPerson {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

/** One person's changes to what they hold happen one at a time. */
export async function oneAtATime(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`person:${userId}`}))`);
}

/** "What's your name?": saved once on the profile and used in every role. */
export async function saveName(person: SignedInPerson, name: unknown): Promise<string> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]!.message, 'name');
  await db().update(users).set({ name: parsed.data }).where(eq(users.id, person.id));
  return parsed.data;
}

/**
 * UX-AC-6, UX-AC-13: "I'm looking for a home", at first run, or "Find a home to rent" from the
 * account menu. Renting becomes one of the person's contexts, and the one that's open. Nothing
 * else is asked: what a renter keeps is theirs to add later (WP-14).
 */
export async function startRenting(person: SignedInPerson): Promise<void> {
  await withPerson(person.id, async (tx) => {
    await oneAtATime(tx, person.id);
    const profile = await profileIn(tx, person.id);
    await saveProfileIn(tx, person.id, {
      rentingSince: profile.rentingSince ?? new Date(),
      lastSide: 'renting',
      firstRunPurpose: null,
      firstRunRegisterEntryId: null,
    });
    // First run ends here for a renter. It counts once a person: for someone who was already
    // letting, the earlier finish stands.
    await recordFunnelStep(tx, {
      step: 'first_run.set_up_finished',
      subjectId: person.id,
      variant: 'renter',
    });
  });
}

/**
 * UX-AC-6: "What brings you to Gaff?" is skipped when Gaff already knows. Someone who signs in
 * on their way to Saved or Enquiries, and has no context yet, is renting: it's noted as sign-in
 * finishes, and they go on to where they were going.
 */
export async function startRentingIfArriving(userId: string, next: string | null): Promise<void> {
  if (purposeFromNext(next) !== 'renting') return;
  if ((await holdingsOf(userId)).contexts.length > 0) return;
  const [person] = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (person) await startRenting(person);
}

/**
 * UX-AC-4, UX-AC-7: a private landlord's organisation of one, made silently the first time they
 * need it: when they choose "I'm letting a home I own", when they choose "Let a home I own" in
 * the account menu, or when they add their first home. Nothing is asked: no business name, no
 * licence. Renters see their first name for now (UX-AC-9). It becomes the open context.
 *
 * Safe to call again: a person has one, and gets the same one back.
 */
export async function ensureOwnHomes(
  person: SignedInPerson,
): Promise<{ organisationId: string; created: boolean }> {
  return db().transaction(async (tx) => {
    await scopeToPerson(tx, person.id);
    await oneAtATime(tx, person.id);
    const [existing] = await tx
      .select({ organisationId: organisations.id })
      .from(memberships)
      .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
      .where(and(eq(memberships.userId, person.id), eq(organisations.kind, 'private_landlord')))
      .limit(1);
    // The name as it is now: it may have been given a moment ago, in this same visit.
    const [{ name } = { name: person.name }] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, person.id));
    const settled = { firstRunPurpose: null, firstRunRegisterEntryId: null } as const;
    if (existing) {
      await saveProfileIn(tx, person.id, {
        lastSide: 'letting',
        lastOrganisationId: existing.organisationId,
        ...settled,
      });
      return { organisationId: existing.organisationId, created: false };
    }
    if (!nameIsKnown(name)) throw new UserFacingError('Enter your name', 'name');
    const { organisationId } = await createOrganisationIn(tx, {
      kind: 'private_landlord',
      name: firstNameOf(name),
      adminUserId: person.id,
      actor: { type: 'person', userId: person.id },
    });
    // UX-PF-11: someone who keeps a verified identity isn't checked again to let their own.
    await carryIdentityToOwnHomes(tx, person.id);
    await saveProfileIn(tx, person.id, {
      lastSide: 'letting',
      lastOrganisationId: organisationId,
      ...settled,
    });
    return { organisationId, created: true };
  });
}

/**
 * UX-AC-11: switches to a context the person already has, in one tap. Gaff reopens it next
 * time. Returns where that side opens.
 */
export async function switchContext(person: SignedInPerson, key: string): Promise<'/today' | '/'> {
  const { contexts } = await holdingsOf(person.id);
  const context = contexts.find((candidate) => candidate.key === key);
  if (!context) throw new UserFacingError('We couldn’t find that. Try again from the menu.');
  await withPerson(person.id, (tx) =>
    saveProfileIn(
      tx,
      person.id,
      context.key === RENTING
        ? { lastSide: 'renting' }
        : { lastSide: 'letting', lastOrganisationId: context.key },
    ),
  );
  return homeFor(context.side);
}
