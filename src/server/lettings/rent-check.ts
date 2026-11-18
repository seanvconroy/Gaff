import { desc, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettings, rentChecks, tenancies } from '@/db/schema';
import { MAX_RENT_CENTS, MIN_RENT_CENTS } from '@/domain/lettings/new-letting';
import {
  RENT_RULES_VERSION,
  capCeilingCents,
  checkRent,
  rentAnswersFromLastTime,
  type RentAnswers,
  type RentCheckInput,
  type RentCheckOutcome,
} from '@/domain/rent/rent-check';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { assertMayActOn } from '@/server/team/permissions';

/**
 * R3: records the rent check. Re-checking replaces the previous check; the record keeps every
 * one. UX-LT-12: the check never asks for the rent again: it is made against the rent the
 * letting already has. `askingRentCents` changes that rent in the same step, for callers that
 * have a new one to set.
 */
export async function recordRentCheck(
  member: Member,
  lettingId: string,
  input: RentCheckInput,
  askingRentCents?: number,
): Promise<RentCheckOutcome> {
  const outcome = checkRent(input);
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const [letting] = await tx
      .select({ rent: lettings.monthlyRentCents, status: lettings.status })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    if (letting.status === 'let' || letting.status === 'withdrawn') {
      throw new UserFacingError('This letting is closed, so its rent check can’t change.');
    }

    const previous = input.lastLet === 'never' ? null : input;
    const values = {
      organisationId: member.organisationId,
      lastLet: input.lastLet,
      ending: previous?.ending ?? null,
      substantialChange: previous?.substantialChange ?? false,
      previousRentCents: previous?.previousRentCents ?? null,
      previousRentSetOn: previous?.previousRentSetOn ?? null,
      result: outcome.result,
      reason: outcome.reason,
      rulesVersion: RENT_RULES_VERSION,
      checkedBy: member.userId,
      checkedAt: new Date(),
    };
    await tx
      .insert(rentChecks)
      .values({ lettingId, ...values })
      .onConflictDoUpdate({ target: rentChecks.lettingId, set: values });

    const actor = { type: 'person', userId: member.userId } as const;
    if (askingRentCents !== undefined && askingRentCents !== letting.rent) {
      await tx
        .update(lettings)
        .set({ monthlyRentCents: askingRentCents })
        .where(eq(lettings.id, lettingId));
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor,
        type: 'letting.rent_changed',
        data: { fromCents: letting.rent, toCents: askingRentCents },
      });
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor,
      type: 'rent_check.recorded',
      subject: { type: 'letting', id: lettingId },
      data: {
        result: outcome.result,
        reason: outcome.reason,
        rulesVersion: RENT_RULES_VERSION,
        lastLet: input.lastLet,
        ...(previous
          ? {
              ...(previous.ending ? { ending: previous.ending } : {}),
              previousRentCents: previous.previousRentCents,
              previousRentSetOn: previous.previousRentSetOn,
            }
          : {}),
      },
    });
  });
  return outcome;
}

/**
 * UX-LT-13: the rent is changed on the rent check's result screen, where the asking rent is
 * above what the rules allow. A person's change, recorded as theirs.
 */
export async function changeAskingRent(
  member: Member,
  lettingId: string,
  rentCents: number,
): Promise<void> {
  if (!Number.isInteger(rentCents) || rentCents < MIN_RENT_CENTS || rentCents > MAX_RENT_CENTS) {
    throw new UserFacingError('Enter a monthly rent between €100 and €20,000', 'rent');
  }
  await withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const [letting] = await tx
      .select({ rent: lettings.monthlyRentCents, status: lettings.status })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    if (letting.status === 'let' || letting.status === 'withdrawn') {
      throw new UserFacingError('This letting is closed, so its rent can’t change.');
    }
    if (letting.rent === rentCents) return;
    await tx
      .update(lettings)
      .set({ monthlyRentCents: rentCents })
      .where(eq(lettings.id, lettingId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.rent_changed',
      data: { fromCents: letting.rent, toCents: rentCents },
    });
  });
}

/**
 * UX-LT-23: what the rent check starts with on a letting made by "Let it again": the rent the
 * home was last let at, and the day that tenancy began. Null where the home wasn't let last
 * time, so there is nothing to start from. Nothing about the tenant is read.
 */
export async function rentAnswersFromLettingBefore(
  member: Member,
  previousLettingId: string | null,
): Promise<RentAnswers | null> {
  if (!previousLettingId) return null;
  return withOrg(member.organisationId, async (tx) => {
    const [tenancy] = await tx
      .select({ rentCents: tenancies.rentCents, startDate: tenancies.startDate })
      .from(tenancies)
      .where(eq(tenancies.lettingId, previousLettingId))
      .orderBy(desc(tenancies.createdAt))
      .limit(1);
    return tenancy
      ? rentAnswersFromLastTime({
          rentCents: tenancy.rentCents,
          tenancyStartedOn: tenancy.startDate,
        })
      : null;
  });
}

export type RentCheckRow = typeof rentChecks.$inferSelect;

/**
 * Whether the rent check is done for set-up: recorded, and not asking more than the cap
 * could ever allow. An advertised rent above the 2% ceiling is certainly unlawful.
 */
export function rentCheckProblem(
  check: RentCheckRow | null,
  askingRentCents: number,
  today: string = irishToday(),
): { ceilingCents: number } | null {
  if (!check || check.result !== 'capped' || !check.previousRentCents || !check.previousRentSetOn) {
    return null;
  }
  const ceilingCents = capCeilingCents(check.previousRentCents, check.previousRentSetOn, today);
  return askingRentCents > ceilingCents ? { ceilingCents } : null;
}
