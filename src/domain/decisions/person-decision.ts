/**
 * ADR-0007: a person makes every decision about a renter. Domain functions that change a
 * renter's chances take a PersonDecision. Only src/server/decisions can create one, from a
 * signed-in member's request; a lint rule rejects `as PersonDecision` anywhere else.
 */

declare const personDecisionBrand: unique symbol;

export const decisionKinds = [
  /** Stage 1: the operator confirms the facts, rent check and criteria. */
  'confirm_setup',
  /** R29: the operator approves (or edits) an AI-written message before it is sent. */
  'approve_message',
  /** R11: the operator approves who is invited to view, and the waitlist. */
  'invite_to_view',
  /** R15: the operator marks whether someone came to their viewing. It decides who may apply. */
  'mark_attendance',
  /** R26: the operator closes a letting as let or withdrawn, which ends everyone's chances. */
  'close_letting',
] as const;

export type DecisionKind = (typeof decisionKinds)[number];

export interface PersonDecision {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly organisationId: string;
  readonly lettingId: string | null;
  readonly decidedByUserId: string;
  readonly [personDecisionBrand]: true;
}

export class DecisionRequiredError extends Error {
  constructor(expected: DecisionKind, actual?: DecisionKind) {
    super(
      actual
        ? `This needs a "${expected}" decision by a person, not "${actual}" (ADR-0007).`
        : `This needs a "${expected}" decision by a person (ADR-0007).`,
    );
  }
}

/** Throws unless the decision is of the expected kind, for the expected letting. */
export function requireDecision(
  decision: PersonDecision | undefined,
  kind: DecisionKind,
  lettingId: string,
): PersonDecision {
  if (!decision) throw new DecisionRequiredError(kind);
  if (decision.kind !== kind) throw new DecisionRequiredError(kind, decision.kind);
  if (decision.lettingId !== lettingId) {
    throw new Error('This decision was made for a different letting (ADR-0007).');
  }
  return decision;
}
