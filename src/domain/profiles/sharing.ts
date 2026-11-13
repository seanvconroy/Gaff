/**
 * Rule 2 and M11: a renter's details are copied to a letter in groups, each only at its stage
 * (the PRD workflow table). An enquiry shares contact details and the answers to the letter's
 * own questions; employment and income wait for an application after a viewing; checks wait
 * until the renter is chosen as the preferred applicant or the backup.
 */
export const dataGroups = ['contact', 'answers', 'employment', 'checks'] as const;
export type DataGroup = (typeof dataGroups)[number];

export type SharingStage = 'enquiry' | 'application' | 'chosen';

const groupsAt: Record<SharingStage, readonly DataGroup[]> = {
  enquiry: ['contact', 'answers'],
  application: ['contact', 'answers', 'employment'],
  chosen: ['contact', 'answers', 'employment', 'checks'],
};

export function groupsSharedAt(stage: SharingStage): readonly DataGroup[] {
  return groupsAt[stage];
}

export function maySharePart(group: DataGroup, stage: SharingStage): boolean {
  return groupsAt[stage].includes(group);
}

/** M12: what each group means, in the renter's words. */
export const dataGroupWords: Record<DataGroup, string> = {
  contact: 'Your name, email address and mobile number, if you gave it',
  answers: 'Your answers to their questions before a viewing',
  employment: 'How you earn and your household’s income',
  checks: 'The results of your identity, affordability and reference checks',
};
