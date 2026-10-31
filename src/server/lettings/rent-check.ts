import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettings, rentChecks } from '@/db/schema';
import {
  RENT_RULES_VERSION,
  capCeilingCents,
  checkRent,
  type RentCheckInput,
  type RentCheckOutcome,
} from '@/domain/rent/rent-check';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/**
 * R3: records the rent check and the rent the operator is asking. Re-checking replaces the
 * previous check; the record keeps every one.
 */
export async function recordRentCheck(
  member: Member,
  lettingId: string,
  input: RentCheckInput,
  askingRentCents: number,
): Promise<RentCheckOutcome> {
  const outcome = checkRent(input);
  await withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select({ rent: lettings.monthlyRentCents })
      .from(lettings)
      .where(eq(lettings.id, lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');

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
    if (askingRentCents !== letting.rent) {
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
              ending: previous.ending,
              previousRentCents: previous.previousRentCents,
              previousRentSetOn: previous.previousRentSetOn,
            }
          : {}),
      },
    });
  });
  return outcome;
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
