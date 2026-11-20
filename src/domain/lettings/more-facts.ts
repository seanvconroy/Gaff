import { z } from 'zod';

/**
 * M39, M40, M44 (BA-14): more of what renters ask about a home, each offered and never required:
 * en-suites, the floor area, which floor and whether there is a lift, the heating, outdoor
 * space, the appliances that matter, broadband, the BER's number, and a link to a video or
 * virtual tour. Each is a fact about the home or its building, from a closed list or a number,
 * so nothing here can describe who a home suits or touch a protected ground (rule 3). None is a
 * search filter (Q51: the redesign's short list of filters stays), and none is ever kept in a
 * saved search. A lift is a fact about the building, shown as a fact.
 *
 * A letting keeps them together (`lettings.more_facts`); the steps carry them as flat answers.
 */

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

/** The appliances renters ask about. The rest of a kitchen goes without saying. */
export const appliances = {
  washing_machine: 'Washing machine',
  dryer: 'Dryer',
  dishwasher: 'Dishwasher',
} as const;

export const broadbandTypes = {
  fibre: 'Fibre broadband',
  other: 'Broadband',
} as const;

export type Heating = keyof typeof heatingTypes;
export type OutdoorSpace = keyof typeof outdoorSpaces;
export type Appliance = keyof typeof appliances;
export type Broadband = keyof typeof broadbandTypes;

const keys = <T extends Record<string, string>>(record: T) =>
  Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];

export const MIN_FLOOR_AREA = 10;
export const MAX_FLOOR_AREA = 2000;
/** -1 is a basement, 0 the ground floor. */
export const LOWEST_FLOOR = -1;
export const HIGHEST_FLOOR = 60;

/**
 * M44: the hosts a tour link may point to, as the live line allows: video and virtual tours,
 * and nothing that could carry anything else. Gaff only links out: it never fetches, embeds or
 * plays one (rule 10).
 */
export const TOUR_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'matterport.com'] as const;

/** M44: a tour link Gaff may show: a secure web address on one of the allowed hosts. */
export function isTourUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return TOUR_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** M40: a BER's number has nine digits ("104123456"), however it was spaced. */
export function normaliseBerNumber(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{9}$/.test(digits) ? digits : null;
}

/** What a letting keeps. Every field may be missing: a missing one was never given. */
export const moreFactsSchema = z.strictObject({
  ensuites: z.number().int().min(1).max(10).optional(),
  floorAreaSqm: z.number().int().min(MIN_FLOOR_AREA).max(MAX_FLOOR_AREA).optional(),
  floor: z.number().int().min(LOWEST_FLOOR).max(HIGHEST_FLOOR).optional(),
  lift: z.boolean().optional(),
  heating: z.enum(keys(heatingTypes)).optional(),
  outdoorSpace: z.enum(keys(outdoorSpaces)).optional(),
  appliances: z
    .array(z.enum(keys(appliances)))
    .max(3)
    .optional(),
  broadband: z.enum(keys(broadbandTypes)).optional(),
  berNumber: z
    .string()
    .regex(/^\d{9}$/)
    .optional(),
  tourUrl: z.string().max(300).refine(isTourUrl).optional(),
});
export type MoreFacts = z.infer<typeof moreFactsSchema>;
export type MoreFactKey = keyof MoreFacts;

/** In the order they are asked and shown. */
export const moreFactKeys = [
  'ensuites',
  'floorAreaSqm',
  'floor',
  'lift',
  'heating',
  'outdoorSpace',
  'appliances',
  'broadband',
  'berNumber',
  'tourUrl',
] as const satisfies readonly MoreFactKey[];

/** The facts a letting holds, without the ones that weren't given; null when none were. */
export function keptMoreFacts(facts: Partial<Record<MoreFactKey, unknown>>): MoreFacts | null {
  const kept: Record<string, unknown> = {};
  for (const key of moreFactKeys) {
    const value = facts[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    kept[key] = value;
  }
  const parsed = moreFactsSchema.safeParse(kept);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return null;
  return parsed.data;
}

/** A stored value, read back whatever it holds: a value that no longer reads is left out. */
export function readMoreFacts(stored: unknown): MoreFacts {
  if (!stored || typeof stored !== 'object') return {};
  const kept: Record<string, unknown> = {};
  for (const key of moreFactKeys) {
    const value = (stored as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const field = moreFactsSchema.shape[key].safeParse(value);
    if (field.success && field.data !== undefined) kept[key] = field.data;
  }
  return kept as MoreFacts;
}

/** "Ground floor", "Basement", "2nd floor". */
export function floorWords(floor: number): string {
  if (floor === 0) return 'Ground floor';
  if (floor < 0) return 'Basement';
  const tens = floor % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[floor % 10] ?? 'th');
  return `${floor}${suffix} floor`;
}

/** "Washing machine, dryer and dishwasher". */
function listed(words: readonly string[]): string {
  const lower = words.map((word, i) => (i === 0 ? word : word.toLowerCase()));
  return lower.length <= 1
    ? (lower[0] ?? '')
    : `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}

/** One fact as a label and its value, for the Home view, the preview and the AI's answers (R8). */
export interface MoreFactLine {
  key: Exclude<MoreFactKey, 'tourUrl'>;
  label: string;
  value: string;
}

/**
 * The facts as label and value pairs, in order. The tour link isn't one: it is a link out,
 * shown as a link (`tourLink`). A lift is said either way once the floor or the lift was given.
 */
export function moreFactLines(facts: MoreFacts): MoreFactLine[] {
  const lines: MoreFactLine[] = [];
  if (facts.ensuites)
    lines.push({ key: 'ensuites', label: 'En-suites', value: String(facts.ensuites) });
  if (facts.floorAreaSqm) {
    lines.push({ key: 'floorAreaSqm', label: 'Floor area', value: `${facts.floorAreaSqm} m²` });
  }
  if (facts.floor !== undefined) {
    lines.push({ key: 'floor', label: 'Floor', value: floorWords(facts.floor) });
  }
  if (facts.lift !== undefined) {
    lines.push({ key: 'lift', label: 'Lift', value: facts.lift ? 'Yes' : 'No' });
  }
  if (facts.heating)
    lines.push({ key: 'heating', label: 'Heating', value: heatingTypes[facts.heating] });
  if (facts.outdoorSpace) {
    lines.push({
      key: 'outdoorSpace',
      label: 'Outdoor space',
      value: outdoorSpaces[facts.outdoorSpace],
    });
  }
  if (facts.appliances?.length) {
    lines.push({
      key: 'appliances',
      label: 'Appliances',
      value: listed(facts.appliances.map((a) => appliances[a])),
    });
  }
  if (facts.broadband) {
    lines.push({ key: 'broadband', label: 'Broadband', value: broadbandTypes[facts.broadband] });
  }
  if (facts.berNumber)
    lines.push({ key: 'berNumber', label: 'BER number', value: facts.berNumber });
  return lines;
}

/**
 * UX-LS-2: the facts as a home's page says them, a short phrase each, for its highlights:
 * "1 en-suite", "75 m²", "2nd floor, with a lift", "Gas central heating", "Private garden",
 * "Washing machine and dryer", "Fibre broadband". The BER's number is beside the BER (UX-LS-8).
 */
export function moreFactHighlights(
  facts: MoreFacts,
): Array<{ key: Exclude<MoreFactKey, 'tourUrl' | 'berNumber' | 'lift'>; text: string }> {
  const out: Array<{ key: Exclude<MoreFactKey, 'tourUrl' | 'berNumber' | 'lift'>; text: string }> =
    [];
  if (facts.ensuites) {
    out.push({
      key: 'ensuites',
      text: `${facts.ensuites} ${facts.ensuites === 1 ? 'en-suite' : 'en-suites'}`,
    });
  }
  if (facts.floorAreaSqm) out.push({ key: 'floorAreaSqm', text: `${facts.floorAreaSqm} m²` });
  if (facts.floor !== undefined) {
    const floor = floorWords(facts.floor);
    const lift = facts.lift === undefined ? '' : facts.lift ? ', with a lift' : ', no lift';
    out.push({ key: 'floor', text: `${floor}${lift}` });
  } else if (facts.lift !== undefined) {
    out.push({ key: 'floor', text: facts.lift ? 'Lift in the building' : 'No lift' });
  }
  if (facts.heating) out.push({ key: 'heating', text: heatingTypes[facts.heating] });
  if (facts.outdoorSpace)
    out.push({ key: 'outdoorSpace', text: outdoorSpaces[facts.outdoorSpace] });
  if (facts.appliances?.length) {
    out.push({ key: 'appliances', text: listed(facts.appliances.map((a) => appliances[a])) });
  }
  if (facts.broadband) out.push({ key: 'broadband', text: broadbandTypes[facts.broadband] });
  return out;
}

/** M44: where the tour is, and what its link says. Null without a tour, or with one not allowed. */
export function tourLink(facts: MoreFacts): { href: string; host: string } | null {
  if (!facts.tourUrl || !isTourUrl(facts.tourUrl)) return null;
  const host = new URL(facts.tourUrl).hostname.toLowerCase();
  const name = host.includes('matterport')
    ? 'Matterport'
    : host.includes('vimeo')
      ? 'Vimeo'
      : 'YouTube';
  return { href: facts.tourUrl, host: name };
}
