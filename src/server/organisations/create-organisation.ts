import { eq, sql } from 'drizzle-orm';
import { scopeToOrg, type Tx } from '@/db/client';
import { memberships, organisations } from '@/db/schema';
import { inboundSlugFor, ownHomesSlug } from '@/domain/organisations/gaff-address';
import type { OrganisationKind } from '@/domain/organisations/kinds';
import { type Actor, recordEvent } from '@/server/record/events';

export interface NewOrganisation {
  kind: OrganisationKind;
  /** The name renters see (UX-AC-9). */
  name: string;
  /** An agency's entry in the PSRA register, and the licence number copied from it. */
  psraRegisterEntryId?: string | null;
  psraLicenceNumber?: string | null;
  /** UX-AG-5: set when a founder creates a pilot agency, which arrives confirmed. */
  confirmed?: { at: Date; by: string | null } | null;
  /** The first admin, if they're already a person on Gaff. A founder's invite has none yet. */
  adminUserId: string | null;
  /** Who is doing this: the person themselves, or the system for a founder's pilot agency. */
  actor: Actor;
}

/**
 * Makes an organisation, and its first admin, in the caller's transaction, and leaves the
 * transaction scoped to it. The one place an organisation is made: first run and the account
 * menu call it through src/server/accounts, and a founder through src/server/accounts/staff.
 */
export async function createOrganisationIn(
  tx: Tx,
  input: NewOrganisation,
): Promise<{ organisationId: string }> {
  const slugBase =
    input.kind === 'private_landlord'
      ? ownHomesSlug(crypto.randomUUID())
      : inboundSlugFor(input.name);
  const [organisation] = await tx
    .insert(organisations)
    .values({
      name: input.name,
      kind: input.kind,
      psraLicenceNumber: input.psraLicenceNumber ?? null,
      psraRegisterEntryId: input.psraRegisterEntryId ?? null,
      confirmedAt: input.confirmed?.at ?? null,
      confirmedBy: input.confirmed?.by ?? null,
      inboundSlug: await uniqueInboundSlug(tx, slugBase),
    })
    .returning({ id: organisations.id });
  const organisationId = organisation!.id;

  await scopeToOrg(tx, organisationId);
  await recordEvent(tx, {
    organisationId,
    actor: input.actor,
    type: 'organisation.created',
    data: { kind: input.kind },
  });
  if (input.adminUserId) {
    await addMemberIn(tx, organisationId, input.adminUserId, 'admin', input.actor);
  }
  return { organisationId };
}

/** Adds a person to an organisation, in a transaction scoped to it. Safe to do twice. */
export async function addMemberIn(
  tx: Tx,
  organisationId: string,
  userId: string,
  role: 'admin' | 'negotiator',
  actor: Actor,
): Promise<void> {
  const added = await tx
    .insert(memberships)
    .values({ organisationId, userId, role })
    .onConflictDoNothing()
    .returning({ userId: memberships.userId });
  if (added.length === 0) return;
  await recordEvent(tx, { organisationId, actor, type: 'member.joined', data: { role } });
}

/**
 * The first free Gaff address from a name: "halcyon-lettings", then "halcyon-lettings-2". Two
 * organisations made at the same moment with the same name wait for one another here, so they
 * can't both take the same address.
 */
async function uniqueInboundSlug(tx: Tx, base: string): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gaff-address:${base}`}))`);
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const [taken] = await tx
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.inboundSlug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
