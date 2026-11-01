import { eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { organisations } from '@/db/schema';
import { incomeRuleChoices } from '@/domain/applications/apply';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/**
 * R16, R17: the operator's income rule. The same for everyone, shown to renters before they
 * apply, and never an automatic refusal (PRD fairness rules). Only an admin changes it.
 */
export async function setIncomeRule(member: Member, ruleTenths: number): Promise<void> {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can change this.');
  if (!(incomeRuleChoices as readonly number[]).includes(ruleTenths)) {
    throw new UserFacingError('Choose one of the income rules.');
  }
  await withOrg(member.organisationId, async (tx) => {
    await tx
      .update(organisations)
      .set({ incomeRuleTenths: ruleTenths })
      .where(eq(organisations.id, member.organisationId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'settings.income_rule',
      data: { ruleTenths },
    });
  });
}
