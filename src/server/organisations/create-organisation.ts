import { eq } from 'drizzle-orm';
import { db, scopeToOrg, type Tx } from '@/db/client';
import { memberships, organisations, users } from '@/db/schema';
import { inboundSlugFor, type NewOrganisation } from '@/domain/organisations/new-organisation';
import { recordEvent } from '@/server/record/events';
import { requestLicenceCheck } from '@/server/verification/licence';
import { uniqueOrganisationSlug } from './profile';

/**
 * Self-serve onboarding: the signed-in user creates their organisation and becomes its
 * admin. Safe to call twice: a user who already belongs to one gets it back.
 */
export async function createOrganisation(
  userId: string,
  input: NewOrganisation,
): Promise<{ organisationId: string }> {
  return db().transaction(async (tx) => {
    const [existing] = await tx
      .select({ organisationId: memberships.organisationId })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    if (existing) return existing;

    const [organisation] = await tx
      .insert(organisations)
      .values({
        name: input.name,
        kind: input.kind,
        slug: await uniqueOrganisationSlug(input.name),
        psraLicenceNumber: input.psraLicenceNumber ?? null,
        inboundSlug: await uniqueInboundSlug(tx, inboundSlugFor(input.name)),
      })
      .returning({ id: organisations.id });
    const organisationId = organisation!.id;

    await tx.insert(memberships).values({ organisationId, userId, role: 'admin' });
    await tx.update(users).set({ name: input.yourName }).where(eq(users.id, userId));

    await scopeToOrg(tx, organisationId);
    const actor = { type: 'person', userId } as const;
    await recordEvent(tx, {
      organisationId,
      actor,
      type: 'organisation.created',
      data: { kind: input.kind },
    });
    await recordEvent(tx, {
      organisationId,
      actor,
      type: 'member.joined',
      data: { role: 'admin' },
    });
    // M23: an agency's licence goes straight into the check queue.
    if (input.kind === 'agency' && input.psraLicenceNumber) {
      await requestLicenceCheck(tx, {
        organisationId,
        userId: null,
        licenceNumber: input.psraLicenceNumber,
        by: userId,
      });
    }
    return { organisationId };
  });
}

async function uniqueInboundSlug(tx: Tx, base: string): Promise<string> {
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
