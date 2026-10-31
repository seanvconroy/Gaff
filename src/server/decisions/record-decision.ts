import type { Tx } from '@/db/client';
import { decisions } from '@/db/schema';
import type { DecisionKind, PersonDecision } from '@/domain/decisions/person-decision';
import { assertNoPersonalData } from '@/domain/record/personal-data';
import type { Member } from '@/server/auth/member';

/**
 * The only place a PersonDecision is created (ADR-0007). It needs a Member, which only
 * exists for a signed-in person in the request's organisation (src/server/auth/member.ts).
 */
export async function recordDecision(
  tx: Tx,
  input: {
    member: Member;
    kind: DecisionKind;
    lettingId: string | null;
    basis: Record<string, unknown>;
  },
): Promise<PersonDecision> {
  assertNoPersonalData(`decision.${input.kind}`, input.basis);
  const [row] = await tx
    .insert(decisions)
    .values({
      organisationId: input.member.organisationId,
      lettingId: input.lettingId,
      kind: input.kind,
      decidedBy: input.member.userId,
      basis: input.basis,
    })
    .returning({ id: decisions.id });
  if (!row) throw new Error('Could not record the decision');
  return {
    id: row.id,
    kind: input.kind,
    organisationId: input.member.organisationId,
    lettingId: input.lettingId,
    decidedByUserId: input.member.userId,
  } as PersonDecision;
}
