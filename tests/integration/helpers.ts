import { db } from '@/db/client';
import { users } from '@/db/schema';
import { findMember, type Member } from '@/server/auth/member';
import { createOrganisation } from '@/server/organisations/create-organisation';

/** A signed-up operator with their own organisation, isolated from every other test. */
export async function createTestMember(
  overrides: { name?: string; organisation?: string; kind?: 'agency' | 'landlord' } = {},
): Promise<Member> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({ id, name: 'pending', email: `${id}@test.gaff.ie`, emailVerified: true });
  const kind = overrides.kind ?? 'agency';
  await createOrganisation(id, {
    yourName: overrides.name ?? 'Ann Power',
    name: overrides.organisation ?? `Halcyon ${id.slice(0, 6)}`,
    kind,
    psraLicenceNumber: kind === 'agency' ? '001234' : undefined,
  });
  const member = await findMember(id);
  if (!member) throw new Error('test member was not created');
  return member;
}

/** The database's own message for a failed query (Drizzle wraps it as the error's cause). */
export async function databaseError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error('expected the database to refuse this');
}
