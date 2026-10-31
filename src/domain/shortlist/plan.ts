/**
 * R11: the operator chooses who to invite in one action; Gaff works out the rest the same way
 * for everyone. The waiting list is the next people in ranked order (open question Q2), and
 * everyone else gets a holding message (Q6). Only people not yet decided can be chosen.
 */
export interface InvitationPlan {
  invited: string[];
  waitlisted: string[];
  notInvited: string[];
}

export class PlanError extends Error {}

export const MAX_WAITLIST = 50;

export function planInvitations(input: {
  /** Everyone, in ranked order. */
  rankedIds: readonly string[];
  /** People still waiting for a decision (status "enquired"). */
  undecidedIds: ReadonlySet<string>;
  chosenIds: ReadonlySet<string>;
  waitlistSize: number;
}): InvitationPlan {
  const { rankedIds, undecidedIds, chosenIds, waitlistSize } = input;
  for (const id of chosenIds) {
    if (!undecidedIds.has(id)) throw new PlanError('Someone you chose has already been decided.');
  }
  if (chosenIds.size === 0) throw new PlanError('Choose at least one person to invite.');
  if (!Number.isInteger(waitlistSize) || waitlistSize < 0 || waitlistSize > MAX_WAITLIST) {
    throw new PlanError(`The waiting list can hold up to ${MAX_WAITLIST} people.`);
  }
  const undecided = rankedIds.filter((id) => undecidedIds.has(id));
  const invited = undecided.filter((id) => chosenIds.has(id));
  const rest = undecided.filter((id) => !chosenIds.has(id));
  return {
    invited,
    waitlisted: rest.slice(0, waitlistSize),
    notInvited: rest.slice(waitlistSize),
  };
}

/** How many to tick by default: as many as there are places left. */
export function defaultInviteCount(placesLeft: number, undecided: number): number {
  return Math.max(0, Math.min(placesLeft, undecided));
}
