import { furnishing, parkingOptions } from '@/domain/lettings/new-letting';

/**
 * M39: the facts of a home renters filter and decide on, each from a closed list so search,
 * cards and the equality rules can rely on them. Labels are the words renters see.
 */

export { furnishing, parkingOptions };

export const propertyTypes = {
  apartment: 'Apartment',
  house: 'House',
  duplex: 'Duplex',
  studio: 'Studio',
  bungalow: 'Bungalow',
  townhouse: 'Townhouse',
  other: 'Other',
} as const;

export const heatingTypes = {
  gas: 'Gas central heating',
  oil: 'Oil central heating',
  electric: 'Electric heating',
  heat_pump: 'Heat pump',
  district: 'District heating',
  solid_fuel: 'Solid fuel',
  other: 'Other heating',
} as const;

export const outdoorSpaces = {
  none: 'No outdoor space',
  balcony: 'Balcony',
  patio: 'Patio or yard',
  garden: 'Private garden',
  shared_garden: 'Shared garden',
} as const;

export const accessibilityFeatures = {
  step_free_entrance: 'Step-free entrance',
  lift: 'Lift',
  ground_floor_bedroom: 'Ground-floor bedroom',
  level_access_shower: 'Level-access shower',
  wide_doorways: 'Wide doorways',
} as const;

export const appliances = {
  washing_machine: 'Washing machine',
  dryer: 'Dryer',
  dishwasher: 'Dishwasher',
  microwave: 'Microwave',
  fridge_freezer: 'Fridge-freezer',
  oven: 'Oven',
} as const;

export const broadbandTypes = {
  fibre: 'Fibre broadband',
  other: 'Broadband',
} as const;

export type PropertyType = keyof typeof propertyTypes;
export type Heating = keyof typeof heatingTypes;
export type OutdoorSpace = keyof typeof outdoorSpaces;
export type AccessibilityFeature = keyof typeof accessibilityFeatures;
export type Appliance = keyof typeof appliances;
export type Broadband = keyof typeof broadbandTypes;

/**
 * Rule 4: the deposit is capped at one month's rent (Residential Tenancies (Amendment) Act
 * 2021). Returns the words for the letter, or null if it's fine.
 */
export function depositProblem(depositCents: number, monthlyRentCents: number): string | null {
  if (!Number.isInteger(depositCents) || depositCents < 0) {
    return 'Enter the deposit in euro, like 1,850, or 0 for no deposit';
  }
  if (depositCents > monthlyRentCents) {
    return 'The deposit can’t be more than one month’s rent';
  }
  return null;
}

/** M67: the full cost to move in: the first month's rent and the deposit. Nothing else. */
export function moveInCostCents(monthlyRentCents: number, depositCents: number): number {
  return monthlyRentCents + depositCents;
}
