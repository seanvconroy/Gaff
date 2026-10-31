/**
 * Stage 1, set up: what an operator still has to do before Gaff starts answering
 * enquiries for a home. The operator confirms facts, rent and criteria (PRD workflow).
 */

export const setupSteps = ['facts', 'viewings', 'criteria', 'rent_check', 'comparables'] as const;
export type SetupStep = (typeof setupSteps)[number];

export interface SetupState {
  viewingSlots: number;
  criteriaSet: boolean;
  rentCheckDone: boolean;
  comparables: number;
}

export const REQUIRED_COMPARABLES = 3;

/** Comparables (R4) are needed for the rent-setting pack, so they can follow later. */
const neededToGoLive: Record<SetupStep, boolean> = {
  facts: true,
  viewings: true,
  criteria: true,
  rent_check: true,
  comparables: false,
};

export function isStepDone(step: SetupStep, state: SetupState): boolean {
  switch (step) {
    case 'facts':
      return true;
    case 'viewings':
      return state.viewingSlots > 0;
    case 'criteria':
      return state.criteriaSet;
    case 'rent_check':
      return state.rentCheckDone;
    case 'comparables':
      return state.comparables >= REQUIRED_COMPARABLES;
  }
}

export function setupChecklist(state: SetupState) {
  return setupSteps.map((step) => ({
    step,
    done: isStepDone(step, state),
    neededToGoLive: neededToGoLive[step],
  }));
}

/** The one next thing to do: the first unfinished step, or going live once the essentials are done. */
export function nextSetupStep(state: SetupState): SetupStep | 'go_live' {
  const pending = setupSteps.find((step) => neededToGoLive[step] && !isStepDone(step, state));
  return pending ?? 'go_live';
}

export function readyToTakeEnquiries(state: SetupState): boolean {
  return nextSetupStep(state) === 'go_live';
}
