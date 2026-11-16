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
