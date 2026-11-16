import { eq } from 'drizzle-orm';
import { type Tx, withPerson } from '@/db/client';
import { profiles } from '@/db/schema';

/**
 * A person's own profile (UX-AC-1, UX-AC-5, ADR-0016). It is read and written only here, and
 * only inside `withPerson()` for the signed-in person themselves: no organisation's path can
 * reach it. A person who has never needed one has no row, which reads as an empty profile.
 */
export type Profile = Omit<typeof profiles.$inferSelect, 'userId' | 'createdAt' | 'updatedAt'>;

const EMPTY: Profile = {
  rentingSince: null,
  lastSide: null,
  lastOrganisationId: null,
  firstRunPurpose: null,
  firstRunRegisterEntryId: null,
};

/** Reads the profile in a transaction that is already scoped to this person. */
export async function profileIn(tx: Tx, userId: string): Promise<Profile> {
  const [row] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
  if (!row) return EMPTY;
  return {
    rentingSince: row.rentingSince,
    lastSide: row.lastSide,
    lastOrganisationId: row.lastOrganisationId,
    firstRunPurpose: row.firstRunPurpose,
    firstRunRegisterEntryId: row.firstRunRegisterEntryId,
  };
}

/** The signed-in person's own profile. Pass their own ID and nobody else's. */
export function readProfile(userId: string): Promise<Profile> {
  return withPerson(userId, (tx) => profileIn(tx, userId));
}

/** Changes the profile in a transaction that is already scoped to this person. */
export async function saveProfileIn(
  tx: Tx,
  userId: string,
  values: Partial<Profile>,
): Promise<void> {
  await tx
    .insert(profiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...values, updatedAt: new Date() } });
}

/**
 * UX-AC-11: remembers the organisation a person is letting for, as they use the workspace, so
 * Gaff reopens it. Nothing is written when it's already what's remembered.
 */
export async function noteLettingFor(userId: string, organisationId: string): Promise<void> {
  await withPerson(userId, async (tx) => {
    const profile = await profileIn(tx, userId);
    if (profile.lastSide === 'letting' && profile.lastOrganisationId === organisationId) return;
    await saveProfileIn(tx, userId, { lastSide: 'letting', lastOrganisationId: organisationId });
  });
}
