import { z } from 'zod';
import { letsOwnHomes, type OrganisationKind } from '@/domain/organisations/kinds';

/**
 * R19, stage 7: the landlord approves the preferred applicant (and the backup) from a one-page
 * summary, by private link, with no account. A landlord letting their own homes approves by
 * making the offer; an agency without the landlord's email confirms the approval itself (Q22).
 */
export type ApprovalRoute = 'own_home' | 'link' | 'operator_confirms';

export function approvalRoute(input: {
  organisationKind: OrganisationKind;
  landlordEmail: string | null;
}): ApprovalRoute {
  if (letsOwnHomes(input.organisationKind)) return 'own_home';
  return input.landlordEmail ? 'link' : 'operator_confirms';
}

const answer = z.enum(['approve', 'decline'], { error: 'Choose approve or decline.' });
const toWord = (v: 'approve' | 'decline'): ApprovalAnswer =>
  v === 'approve' ? 'approved' : 'declined';

export function approvalAnswersSchema(withBackup: boolean) {
  return z
    .object({ preferred: answer, backup: withBackup ? answer : z.unknown().optional() })
    .transform((values) => ({
      preferred: toWord(values.preferred),
      backup: withBackup ? toWord(values.backup as 'approve' | 'decline') : null,
    }));
}

export type ApprovalAnswer = 'approved' | 'declined';

export type ApprovalRole = 'preferred' | 'backup';
export type ApprovalChoice = 'approve' | 'decline';

/**
 * UX-OP-6: the owner answers for one person per screen, the chosen tenant and then the backup.
 * This says whose screen is open: the one asked for (the page's address, or the browser's Back),
 * but never one past the first person still without an answer. Counting from 0.
 */
export function approvalScreen(
  roles: readonly ApprovalRole[],
  answers: Partial<Record<ApprovalRole, ApprovalChoice>>,
  asked?: string | null,
): number {
  const firstOpen = roles.findIndex((role) => !answers[role]);
  const furthest = firstOpen === -1 ? roles.length - 1 : firstOpen;
  const wanted = roles.findIndex((role) => role === asked);
  return wanted >= 0 && wanted <= furthest ? wanted : furthest;
}

/**
 * UX-OP-7: how many of the chosen people's checks aren't back yet. The owner sees "Still under
 * way" beside each, so the agent is warned before asking for approval while any are unfinished.
 */
export function checksStillUnderWay(checks: ReadonlyArray<{ status: string }>): number {
  return checks.filter((check) => check.status === 'to_do' || check.status === 'in_progress')
    .length;
}
