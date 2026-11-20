import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { withOrg } from '@/db/client';
import { lettingHelpers, lettings, memberships, users } from '@/db/schema';
import { shownName } from '@/domain/team/members';
import { refusals, type Role } from '@/domain/team/permissions';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { NOT_ON_TEAM, standingOn, type LettingStanding } from './permissions';

/**
 * UX-AG-8, UX-AG-9: a letting's lead, and helping with a letting someone else leads.
 *
 * - An admin changes any letting's lead; an agent hands over one they lead (the permissions
 *   table). The new lead is someone on the team.
 * - An agent acts on a colleague's letting once they've chosen "Help with this letting". It is
 *   recorded, so the record shows who did what.
 */
const id = z.uuid();

export interface LeadChoices {
  address: string;
  standing: LettingStanding;
  /** Everyone on the team, who could lead it, in the order they joined. */
  members: Array<{ userId: string; name: string; role: Role }>;
}

/** The letting's lead and the team, for "Change lead". Null: no such letting, or not on the team. */
export async function leadChoicesFor(
  member: Member,
  lettingId: string,
): Promise<LeadChoices | null> {
  if (!id.safeParse(lettingId).success) return null;
  return withOrg(member.organisationId, async (tx) => {
    const standing = await standingOn(tx, member, lettingId);
    if (!standing) return null;
    const [letting] = await tx
      .select({ address: lettings.addressLine1 })
      .from(lettings)
      .where(eq(lettings.id, lettingId));
    const members = await tx
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organisationId, member.organisationId))
      .orderBy(asc(memberships.createdAt));
    return {
      address: letting!.address,
      standing,
      members: members.map((each) => ({
        userId: each.userId,
        name: shownName(each),
        role: each.role,
      })),
    };
  });
}

/** UX-AG-9: makes someone on the team the letting's lead. Returns their name. */
export async function changeLead(
  member: Member,
  lettingId: string,
  newLeadUserId: unknown,
): Promise<{ leadName: string; changed: boolean }> {
  if (!id.safeParse(lettingId).success) throw new UserFacingError('We couldn’t find that letting.');
  const lead = id.safeParse(newLeadUserId);
  if (!lead.success) throw new UserFacingError('Choose who leads it.', 'lead');
  return withOrg(member.organisationId, async (tx) => {
    // One change at a time on a letting: the row is held until this one is in.
    await tx
      .select({ id: lettings.id })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    const standing = await standingOn(tx, member, lettingId);
    if (!standing) throw new UserFacingError(NOT_ON_TEAM);
    if (!standing.mayChangeLead) throw new UserFacingError(refusals.change_lead);
    const [chosen] = await tx
      .select({ name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organisationId, member.organisationId),
          eq(memberships.userId, lead.data),
        ),
      );
    if (!chosen) throw new UserFacingError('Choose someone on your team.', 'lead');
    if (standing.leadUserId === lead.data) return { leadName: shownName(chosen), changed: false };
    await tx.update(lettings).set({ leadUserId: lead.data }).where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.lead_changed',
      data: { leadUserId: lead.data, reason: 'changed' },
    });
    return { leadName: shownName(chosen), changed: true };
  });
}

/**
 * UX-AG-8: "Help with this letting". An agent who doesn't lead a letting can act on it from now
 * on. Choosing it twice changes nothing.
 */
export async function helpWithLetting(member: Member, lettingId: string): Promise<void> {
  if (!id.safeParse(lettingId).success) throw new UserFacingError('We couldn’t find that letting.');
  await withOrg(member.organisationId, async (tx) => {
    const standing = await standingOn(tx, member, lettingId);
    if (!standing) throw new UserFacingError(NOT_ON_TEAM);
    if (!standing.offersHelp) return;
    const added = await tx
      .insert(lettingHelpers)
      .values({ organisationId: member.organisationId, lettingId, userId: member.userId })
      .onConflictDoNothing()
      .returning({ userId: lettingHelpers.userId });
    if (added.length === 0) return;
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.help_started',
      data: {},
    });
  });
}

/** Where the member stands on a letting, for its pages: who leads it, and what they may do. */
export async function lettingStandingFor(
  member: Member,
  lettingId: string,
): Promise<(LettingStanding & { leadName: string | null }) | null> {
  if (!id.safeParse(lettingId).success) return null;
  return withOrg(member.organisationId, async (tx) => {
    const standing = await standingOn(tx, member, lettingId);
    if (!standing) return null;
    const [lead] = standing.leadUserId
      ? await tx
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, standing.leadUserId))
      : [];
    return { ...standing, leadName: lead ? shownName(lead) : null };
  });
}
