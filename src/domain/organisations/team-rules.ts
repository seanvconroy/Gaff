/**
 * AU10, M16: the rules for changing who's on a team. Only admins change it, a workspace always
 * keeps at least one admin, and nobody changes their own role or removes themselves (so an
 * admin can't lock the team out by a slip).
 */

export type TeamRole = 'admin' | 'negotiator';

export interface TeamSeat {
  userId: string;
  role: TeamRole;
}

export type TeamChangeProblem = 'not_admin' | 'not_on_team' | 'yourself' | 'last_admin';

const admins = (team: readonly TeamSeat[]) => team.filter((seat) => seat.role === 'admin').length;

function commonProblem(
  team: readonly TeamSeat[],
  by: TeamSeat,
  userId: string,
): TeamChangeProblem | TeamSeat {
  if (by.role !== 'admin') return 'not_admin';
  const seat = team.find((candidate) => candidate.userId === userId);
  if (!seat) return 'not_on_team';
  return seat;
}

/** Why this person can't be removed by that admin; null if they can. */
export function removalProblem(
  team: readonly TeamSeat[],
  by: TeamSeat,
  userId: string,
): TeamChangeProblem | null {
  const seat = commonProblem(team, by, userId);
  if (typeof seat === 'string') return seat;
  if (seat.role === 'admin' && admins(team) === 1) return 'last_admin';
  if (seat.userId === by.userId) return 'yourself';
  return null;
}

/** Why this person's role can't be changed to `role` by that admin; null if it can. */
export function roleChangeProblem(
  team: readonly TeamSeat[],
  by: TeamSeat,
  userId: string,
  role: TeamRole,
): TeamChangeProblem | null {
  const seat = commonProblem(team, by, userId);
  if (typeof seat === 'string') return seat;
  if (seat.role === 'admin' && role !== 'admin' && admins(team) === 1) return 'last_admin';
  if (seat.userId === by.userId) return 'yourself';
  return null;
}

export const teamChangeWords: Record<TeamChangeProblem, string> = {
  not_admin: 'Only an admin can change the team.',
  not_on_team: 'They’re not on your team.',
  yourself: 'Ask another admin to change your own place on the team.',
  last_admin: 'The team needs at least one admin.',
};

/** What the roles are called on screen. */
export const roleWords: Record<TeamRole, string> = { admin: 'Admin', negotiator: 'Agent' };
