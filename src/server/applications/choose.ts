import { and, eq, inArray } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, lettings, organisations } from '@/db/schema';
import { incomeAgainstRule } from '@/domain/applications/apply';
import { CHOOSABLE, validateChoice } from '@/domain/applications/choose';
import type { Member } from '@/server/auth/member';
import { recordDecision } from '@/server/decisions/record-decision';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { rankLetting } from '@/server/shortlist/shortlist';

/**
 * R17: everyone who came to view and applied, in shortlist order, with how they compare with
 * the criteria and the income rule. For the operator only: names are shown.
 */
export async function applicantsFor(member: Member, lettingId: string) {
  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
    const [organisation] = await tx
      .select({ incomeRuleTenths: organisations.incomeRuleTenths })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    if (!letting || !organisation) return null;
    const ranked = await rankLetting(tx, lettingId);
    const people = await tx
      .select()
      .from(applications)
      .where(eq(applications.lettingId, lettingId));
    const byId = new Map(people.map((p) => [p.id, p]));
    const rows = ranked.flatMap((r) => {
      const person = byId.get(r.id)!;
      if (person.personalDataDeletedAt || person.monthlyIncomeCents === null) return [];
      if (
        !['applied', 'preferred', 'backup', 'offered', 'accepted', 'declined'].includes(
          person.status,
        )
      ) {
        return [];
      }
      return [
        {
          id: person.id,
          name: person.fullName,
          status: person.status,
          position: r.position,
          met: r.met,
          total: r.total,
          answered: r.answered,
          reason: r.reason,
          earning: person.earning,
          monthlyIncomeCents: person.monthlyIncomeCents,
          appliedAt: person.appliedAt,
          ...incomeAgainstRule(
            person.monthlyIncomeCents,
            letting.monthlyRentCents,
            organisation.incomeRuleTenths,
          ),
        },
      ];
    });
    const waitingToApply = people
      .filter((p) => p.status === 'attended' && !p.personalDataDeletedAt)
      .map((p) => p.fullName);
    const offerMade = people.some((p) => ['offered', 'accepted'].includes(p.status));
    return { rows, waitingToApply, offerMade, incomeRuleTenths: organisation.incomeRuleTenths };
  });
}

/**
 * R17: a person chooses the preferred applicant and, optionally, a backup. It's their decision
 * (ADR-0007), recorded with what they saw: positions, criteria met and the income comparison,
 * as IDs and numbers only. They can change it until an offer is made.
 */
export async function chooseApplicants(
  member: Member,
  lettingId: string,
  input: { preferredId: string; backupId: string },
): Promise<{ preferredId: string; backupId: string | null }> {
  const listing = await applicantsFor(member, lettingId);
  if (!listing) throw new UserFacingError('We couldn’t find that letting.');
  if (listing.offerMade) {
    throw new UserFacingError('An offer has been made, so the choice can’t change now.');
  }
  const choice = validateChoice({
    applied: new Set(
      listing.rows
        .filter((r) => (CHOOSABLE as readonly string[]).includes(r.status))
        .map((r) => r.id),
    ),
    preferredId: input.preferredId,
    backupId: input.backupId,
  });
  if (!choice.ok) throw new UserFacingError(choice.error);

  return withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select()
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting || letting.status !== 'live') {
      throw new UserFacingError('This home isn’t taking applications.');
    }
    const decision = await recordDecision(tx, {
      member,
      kind: 'choose_applicants',
      lettingId,
      basis: {
        incomeRuleTenths: listing.incomeRuleTenths,
        applicants: listing.rows.map((r) => ({
          applicationId: r.id,
          position: r.position,
          met: r.met,
          total: r.total,
          answered: r.answered,
          ratioTenths: r.ratioTenths,
          meetsIncomeRule: r.meetsRule,
        })),
        preferredId: choice.preferredId,
        backupId: choice.backupId,
      },
    });
    // Anyone chosen before but not now goes back to "applied".
    await tx
      .update(applications)
      .set({ status: 'applied' })
      .where(
        and(
          eq(applications.lettingId, lettingId),
          inArray(applications.status, ['preferred', 'backup']),
        ),
      );
    await tx
      .update(applications)
      .set({ status: 'preferred' })
      .where(eq(applications.id, choice.preferredId));
    if (choice.backupId) {
      await tx
        .update(applications)
        .set({ status: 'backup' })
        .where(eq(applications.id, choice.backupId));
    }
    await tx.update(lettings).set({ stage: 'checks' }).where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'applicants.chosen',
      subject: { type: 'decision', id: decision.id },
      data: {
        decisionId: decision.id,
        applied: listing.rows.length,
        withBackup: choice.backupId !== null,
      },
    });
    return { preferredId: choice.preferredId, backupId: choice.backupId };
  });
}
