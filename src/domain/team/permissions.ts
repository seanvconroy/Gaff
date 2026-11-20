import type { OrganisationKind } from '@/domain/organisations/kinds';

/**
 * UX-AG-8 to UX-AG-10 (section 2, "Agencies: roles and permissions"): who in a team may do what.
 * THE ONE PLACE that answers "may this member do this?". Every use case the table covers asks it,
 * through `src/server/team/permissions.ts`, which reads the member's role as it is now.
 *
 * Two roles, and every team has at least one admin. A landlord's team has the same two
 * (UX-AG-10). A private landlord's organisation of one has a single admin and no team screens.
 *
 * | Can they…                                               | Admin                 | Agent                  |
 * | ------------------------------------------------------- | --------------------- | ---------------------- |
 * | See every letting the agency runs                       | Yes                   | Yes                    |
 * | Add a letting, and run any letting they lead            | Yes                   | Yes                    |
 * | Act on a letting someone else leads                     | Yes                   | After "Help with this" |
 * | Make the three decisions                                | Yes                   | Yes                    |
 * | Change a letting's lead                                 | Yes                   | Their own only         |
 * | Invite and remove members, change roles                 | Yes                   | No                     |
 * | Change agency settings                                  | Yes                   | View only              |
 * | Change where tenants pay                                | With re-confirmation  | No                     |
 * | See "Everyone" on Today and the agency's results        | Yes                   | No                     |
 */
export type Role = 'admin' | 'negotiator';
export const roles = ['admin', 'negotiator'] as const satisfies readonly Role[];

/** What each role is called on screen. In the database an agent is a `negotiator`. */
export const roleLabels: Record<Role, string> = { admin: 'Admin', negotiator: 'Agent' };

export const teamActions = [
  'see_lettings',
  'add_letting',
  'run_own_letting',
  'act_on_others_letting',
  'make_decisions',
  'change_lead',
  'manage_team',
  'change_settings',
  'change_payment_account',
  'see_everyone',
] as const;
export type TeamAction = (typeof teamActions)[number];

/**
 * - `yes` and `no`: as it says.
 * - `after_helping`: once they've tapped "Help with this letting" on it. The record shows who did what.
 * - `own_only`: only on a letting they lead.
 * - `view_only`: they can see it, not change it.
 * - `reconfirm`: yes, once they've confirmed it's them again (UX-SI-10).
 */
export type Permission = 'yes' | 'no' | 'after_helping' | 'own_only' | 'view_only' | 'reconfirm';

/** The table in section 2, row by row. */
export const permissionsTable: Record<TeamAction, Record<Role, Permission>> = {
  see_lettings: { admin: 'yes', negotiator: 'yes' },
  add_letting: { admin: 'yes', negotiator: 'yes' },
  run_own_letting: { admin: 'yes', negotiator: 'yes' },
  act_on_others_letting: { admin: 'yes', negotiator: 'after_helping' },
  make_decisions: { admin: 'yes', negotiator: 'yes' },
  change_lead: { admin: 'yes', negotiator: 'own_only' },
  manage_team: { admin: 'yes', negotiator: 'no' },
  change_settings: { admin: 'yes', negotiator: 'view_only' },
  change_payment_account: { admin: 'reconfirm', negotiator: 'no' },
  see_everyone: { admin: 'yes', negotiator: 'no' },
};

/** What the person's position is, for the rows that depend on it. */
export interface Standing {
  role: Role;
  /** They lead the letting in question. */
  leads?: boolean;
  /** They've tapped "Help with this letting" on it. */
  helping?: boolean;
  /** They've just confirmed it's them again. */
  reconfirmed?: boolean;
}

/** Whether this person may do this now. */
export function may(action: TeamAction, standing: Standing): boolean {
  switch (permissionsTable[action][standing.role]) {
    case 'yes':
      return true;
    case 'no':
    case 'view_only':
      return false;
    case 'after_helping':
      return standing.helping === true;
    case 'own_only':
      return standing.leads === true;
    case 'reconfirm':
      return standing.reconfirmed === true;
  }
}

/** Whether the role can ever do this, given the right letting or a fresh confirmation. */
export function roleCan(action: TeamAction, role: Role): boolean {
  const permission = permissionsTable[action][role];
  return permission !== 'no' && permission !== 'view_only';
}

/**
 * Whether they may act on a letting: run it if they lead it, or act on it if someone else does.
 * Every member may act on a letting nobody leads, so it never stalls.
 */
export function mayActOnLetting(standing: Standing & { leadUserId: string | null }): boolean {
  if (standing.leadUserId === null || standing.leads) return may('run_own_letting', standing);
  return may('act_on_others_letting', standing);
}

/** Whether "Help with this letting" is offered: they can't act on it yet, and helping would let them. */
export function offersHelp(standing: Standing & { leadUserId: string | null }): boolean {
  return !mayActOnLetting(standing) && may('act_on_others_letting', { ...standing, helping: true });
}

/** Whether this organisation has team screens: an agency or a landlord's team, never one person. */
export function hasTeam(kind: OrganisationKind): boolean {
  return kind !== 'private_landlord';
}

/** What is said when the answer is no. */
export const refusals: Record<TeamAction, string> = {
  see_lettings: 'You can’t see this agency’s lettings.',
  add_letting: 'You can’t add a letting here.',
  run_own_letting: 'You can’t work on this letting.',
  act_on_others_letting:
    'Someone else leads this letting. Choose “Help with this letting” to work on it.',
  make_decisions: 'You can’t decide this.',
  change_lead: 'Only an admin, or the letting’s lead, can change who leads it.',
  manage_team: 'Only an admin can change the team.',
  change_settings: 'Only an admin can change this.',
  change_payment_account: 'Only an admin can change this.',
  see_everyone: 'Only an admin can see everyone’s.',
};
