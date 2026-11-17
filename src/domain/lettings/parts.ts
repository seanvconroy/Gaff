import { stages, type Stage } from './stages';

/**
 * The four parts of a letting that people see (UX-LP-3, section 4 "Layout"). The nine stages stay
 * in the data and the record; nine is more than anyone can hold, and most pass without anyone
 * doing anything.
 */
export const lettingParts = ['Set up', 'Find', 'Choose', 'Sign'] as const;

export type LettingPart = (typeof lettingParts)[number];

const partByStage: Record<Stage, number> = {
  setup: 0,
  enquiries: 1,
  shortlist: 1,
  viewings: 1,
  applications: 2,
  checks: 2,
  offer: 2,
  tenancy: 3,
  close: 3,
};

/** Which of the four parts a stage is in, counting from 0. */
export function partOf(stage: Stage): number {
  return partByStage[stage];
}

/**
 * Where a progress bar of the four parts stands: the part the letting is in, or past the end
 * once it has finished, so every part reads as done.
 */
export function partReached(stage: Stage): number {
  return stage === stages[stages.length - 1] ? lettingParts.length : partOf(stage);
}
