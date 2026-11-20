/**
 * BA-15: where each screen of adding a development lives. A development's own set-up is at
 * `/lettings/developments/<id>/setup/<step>`; a type's at `/lettings/developments/<id>/types/
 * <typeId>/<step>`. The development's page on the letting side is `/lettings/developments/<id>`.
 */

export const developmentSteps = ['address', 'pin', 'facts', 'photos'] as const;
export type DevelopmentStep = (typeof developmentSteps)[number];

export const typeSteps = [
  'home',
  'rent',
  'photos',
  'homes',
  'details',
  'rent-check',
  'review',
] as const;
export type TypeStep = (typeof typeSteps)[number];

export const isDevelopmentStep = (step: string): step is DevelopmentStep =>
  (developmentSteps as readonly string[]).includes(step);
export const isTypeStep = (step: string): step is TypeStep =>
  (typeSteps as readonly string[]).includes(step);

export const newDevelopmentHref = '/lettings/developments/new';
export const developmentPageHref = (id: string) => `/lettings/developments/${id}`;
export const developmentStepHref = (id: string, step: DevelopmentStep) =>
  `/lettings/developments/${id}/setup/${step}`;
export const newTypeHref = (id: string) => `/lettings/developments/${id}/types/new`;
export const typeStepHref = (id: string, typeId: string, step: TypeStep) =>
  `/lettings/developments/${id}/types/${typeId}/${step}`;

/** The step after this one, in adding a development and then its first type. */
export function developmentStepAfter(step: DevelopmentStep): DevelopmentStep | 'types' {
  const at = developmentSteps.indexOf(step);
  return developmentSteps[at + 1] ?? 'types';
}

/** The step after this one, in adding a type ("home" is the type's first screen). */
export function typeStepAfter(step: TypeStep): TypeStep {
  const at = typeSteps.indexOf(step);
  return typeSteps[Math.min(at + 1, typeSteps.length - 1)]!;
}

/** The progress bar's segments: the development, its photos, the type, and the type's homes. */
export const progressSegments = [
  'Development',
  'Photos',
  'The type',
  'Homes',
  'Details',
  'Rent check',
  'Go live',
] as const;

export function progressAt(step: DevelopmentStep | 'name' | 'type' | TypeStep): number {
  switch (step) {
    case 'name':
    case 'address':
    case 'pin':
    case 'facts':
      return 0;
    case 'photos':
      return 1;
    case 'type':
    case 'home':
    case 'rent':
      return 2;
    case 'homes':
      return 3;
    case 'details':
      return 4;
    case 'rent-check':
      return 5;
    case 'review':
      return 6;
  }
}

/**
 * Where a type's set-up comes back to, from how far its homes have got: no rent yet, homes still
 * to make, then the letting details, the rent check and the review.
 */
export function typeResumeStep(type: {
  rentCents: number | null;
  homeCount: number | null;
  homes: ReadonlyArray<{ status: string; criteriaSet: boolean; rentCheck: string | null }>;
}): TypeStep {
  if (type.rentCents === null || type.homeCount === null) return 'rent';
  if (type.homes.length < type.homeCount) return 'homes';
  const settingUp = type.homes.filter((home) => home.status === 'draft');
  if (settingUp.some((home) => !home.criteriaSet)) return 'details';
  if (settingUp.some((home) => home.rentCheck === null)) return 'rent-check';
  return 'review';
}
