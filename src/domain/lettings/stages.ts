/** The nine stages of a letting (PRD: the end-to-end workflow). */
export const stages = [
  'setup',
  'enquiries',
  'shortlist',
  'viewings',
  'applications',
  'checks',
  'offer',
  'tenancy',
  'close',
] as const;

export type Stage = (typeof stages)[number];

export const stageLabels: Record<Stage, string> = {
  setup: 'Set up',
  enquiries: 'Enquiries',
  shortlist: 'Shortlist',
  viewings: 'Viewings',
  applications: 'Applications',
  checks: 'Checks',
  offer: 'Offer',
  tenancy: 'Tenancy',
  close: 'Close',
};

export function stageNumber(stage: Stage): number {
  return stages.indexOf(stage) + 1;
}
