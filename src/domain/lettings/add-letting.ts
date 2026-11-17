import { z } from 'zod';
import { criteriaSchema, type Criteria } from '@/domain/criteria/criteria';
import {
  berRatings,
  counties,
  furnishing,
  lettingFields,
  parkingOptions,
  propertyTypes,
} from './new-letting';

/**
 * Adding a letting, a step at a time (section 4 of the UX redesign, UX-LT-1 to UX-LT-16). The
 * rules here say what a home's answers are, which step comes next, where someone who left comes
 * back to, and what "Let it again" carries over. No screen, and nothing about any person.
 *
 * A home being added is a draft until it has an address, a rent, a date, a type and a bedroom
 * count. Then it is a letting in set-up, with the same ID, and the later steps (photos, letting
 * details, the rent check, going live) work on the letting itself.
 */

/** How a draft was started. Only `manual` asks every step: the others arrive filled in. */
export const draftOrigins = ['manual', 'again', 'advert', 'enquiry'] as const;
export type DraftOrigin = (typeof draftOrigins)[number];

const keys = <T extends Record<string, unknown>>(record: T) =>
  Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];

/**
 * What is known about a home so far. Every field may be missing: a missing one was never given,
 * and is never guessed (UX-LT-3). This is also how a draft is filled in from elsewhere: the
 * advert reader (WP-10) and "Let it again" each hand over one of these.
 */
export const draftAnswersSchema = z.strictObject({
  addressLine1: z.string().min(1).max(120).optional(),
  addressLine2: z.string().min(1).max(120).optional(),
  area: z.string().min(1).max(80).optional(),
  county: z.enum(counties).optional(),
  eircode: z.string().max(8).optional(),
  rentCents: z.number().int().positive().optional(),
  availableFrom: z.iso.date().optional(),
  propertyType: z.enum(keys(propertyTypes)).optional(),
  bedrooms: z.number().int().min(0).max(10).optional(),
  bathrooms: z.number().int().min(1).max(10).optional(),
  furnished: z.enum(keys(furnishing)).optional(),
  berRating: z.enum(berRatings).optional(),
  parking: z.enum(keys(parkingOptions)).optional(),
  description: z.string().max(4000).optional(),
  otherFacts: z.array(z.string().max(300)).max(20).optional(),
  /** UX-LT-8: kept to match enquiries to this home. Gaff never fetches them (Q31). */
  daftUrl: z.url().optional(),
  myhomeUrl: z.url().optional(),
  /** Letting details carried in from last time or from an advert: the fixed criteria only. */
  criteria: criteriaSchema.optional(),
  noSmokingIndoors: z.boolean().optional(),
});
export type DraftAnswers = z.infer<typeof draftAnswersSchema>;

/** The steps of the flow, in order, after the first screen (and the review, where there is one). */
export const flowSteps = [
  'address',
  'rent',
  'home',
  'photos',
  'details',
  'rent_check',
  'go_live',
] as const;
export type FlowStep = (typeof flowSteps)[number];

/** Each step's name in the progress bar, and its place in the address bar. */
export const stepNames: Record<FlowStep, string> = {
  address: 'Address',
  rent: 'Rent',
  home: 'The home',
  photos: 'Photos',
  details: 'Details',
  rent_check: 'Rent check',
  go_live: 'Go live',
};
export const stepSlugs: Record<FlowStep, string> = {
  address: 'address',
  rent: 'rent',
  home: 'home',
  photos: 'photos',
  details: 'details',
  rent_check: 'rent-check',
  go_live: 'go-live',
};

export function stepFromSlug(slug: string): FlowStep | null {
  return flowSteps.find((step) => stepSlugs[step] === slug) ?? null;
}

/** The three steps a draft answers before it becomes a letting. */
export type CoreStep = 'address' | 'rent' | 'home';

/**
 * UX-LT-14: which of the first steps still lack what a letting can't exist without: an address,
 * a rent and an available-from date, a type and a bedroom count. In order.
 */
export function missingCore(answers: DraftAnswers): CoreStep[] {
  const missing: CoreStep[] = [];
  if (!answers.addressLine1 || !answers.area || !answers.county) missing.push('address');
  if (answers.rentCents === undefined || !answers.availableFrom) missing.push('rent');
  if (!answers.propertyType || answers.bedrooms === undefined) missing.push('home');
  return missing;
}

/** The answers a letting is made from, once none of the core is missing. */
export type CoreAnswers = DraftAnswers &
  Required<
    Pick<
      DraftAnswers,
      | 'addressLine1'
      | 'area'
      | 'county'
      | 'rentCents'
      | 'availableFrom'
      | 'propertyType'
      | 'bedrooms'
    >
  >;

export function hasCore(answers: DraftAnswers): answers is CoreAnswers {
  return missingCore(answers).length === 0;
}

export interface FlowProgress {
  answers: DraftAnswers;
  /** How many photos the home has. */
  photos: number;
}

/**
 * UX-LT-5: whether a step still needs an answer. The first four can be answered before the
 * person reaches them (by an advert, or by last time); the last three are never skipped.
 */
export function needsAnswer(step: FlowStep, progress: FlowProgress): boolean {
  switch (step) {
    case 'address':
    case 'rent':
    case 'home':
      return missingCore(progress.answers).includes(step);
    case 'photos':
      return progress.photos === 0;
    default:
      return true;
  }
}

/**
 * The step after this one. Someone filling it in themselves sees every step, in order. Where
 * the home arrived filled in, they see only the steps that still need an answer (UX-LT-5): a
 * complete import goes from the review straight to letting details.
 */
export function stepAfter(
  step: FlowStep | 'start' | 'review',
  progress: FlowProgress,
  origin: DraftOrigin,
): FlowStep {
  const from = step === 'start' || step === 'review' ? -1 : flowSteps.indexOf(step);
  const rest = flowSteps.slice(from + 1);
  const next =
    origin === 'manual' ? rest[0] : rest.find((candidate) => needsAnswer(candidate, progress));
  return next ?? 'go_live';
}

/** The step before this one, for Back: the first step goes back to where the flow began. */
export function stepBefore(step: FlowStep, origin: DraftOrigin): FlowStep | 'start' | 'review' {
  const at = flowSteps.indexOf(step);
  if (at > 0) return flowSteps[at - 1]!;
  return origin === 'manual' ? 'start' : 'review';
}

/** The later of two steps: how far someone has got only ever moves forward. */
export function furthestStep(a: FlowStep | null, b: FlowStep): FlowStep {
  return a && flowSteps.indexOf(a) > flowSteps.indexOf(b) ? a : b;
}

/**
 * UX-FL-2: where someone who left comes back to. It is the step they had reached, unless
 * something an earlier step asks for is missing, or they are past a rent check that isn't
 * finished: then it is that step, so nobody lands on a screen they can't complete.
 */
export function resumeStep(
  reached: FlowStep | 'review' | null,
  state: { answers: DraftAnswers; rentCheckDone: boolean },
): FlowStep | 'review' {
  if (reached === 'review') return 'review';
  const at = reached ?? 'address';
  const [missing] = missingCore(state.answers);
  if (missing && flowSteps.indexOf(missing) < flowSteps.indexOf(at)) return missing;
  if (at === 'go_live' && !state.rentCheckDone) return 'rent_check';
  return at;
}

/** UX-LP: "Finish setting up. 2 steps left." How many steps are still ahead, this one included. */
export function stepsLeft(reached: FlowStep | null): number {
  return flowSteps.length - flowSteps.indexOf(reached ?? 'photos');
}

/**
 * What the review marks "Check this" (UX-LT-4): missing, or out of date. For a home that was
 * read from an advert, also what the advert wasn't clear about, and `details`: something it
 * says that could be a letting detail (advert-reading.ts).
 */
export type CheckThis =
  'address' | 'rent' | 'available_from' | 'home' | 'ber' | 'photos' | 'details';

/**
 * UX-LT-3, UX-LT-4: what the review screen asks the person to look at, counted at its top
 * ("3 things to check"). Something that wasn't found is marked; nothing is filled in for them.
 * A date that has passed is marked too: last time's, or an old advert's.
 */
export function thingsToCheck(progress: FlowProgress, today: string): CheckThis[] {
  const { answers } = progress;
  const missing = missingCore(answers);
  const checks: CheckThis[] = [];
  if (missing.includes('address')) checks.push('address');
  if (answers.rentCents === undefined) checks.push('rent');
  if (!answers.availableFrom || answers.availableFrom < today) checks.push('available_from');
  if (missing.includes('home')) checks.push('home');
  if (!answers.berRating) checks.push('ber');
  if (progress.photos === 0) checks.push('photos');
  return checks;
}

type Patch<T> = { [K in keyof T]?: T[K] | undefined };

/** Puts a step's answers into what's known. A value given as undefined is taken out. */
export function withAnswers(answers: DraftAnswers, patch: Patch<DraftAnswers>): DraftAnswers {
  const next: Record<string, unknown> = { ...answers };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
  }
  return draftAnswersSchema.parse(next);
}

/** Step 3, "Where is it?": the full postal address. An address without an Eircode is accepted. */
export function addressStepSchema() {
  const fields = lettingFields();
  return z.object({
    addressLine1: fields.addressLine1,
    addressLine2: fields.addressLine2,
    area: fields.area,
    county: fields.county,
    eircode: fields.eircode,
  });
}

/** Step 4, "Rent and date". */
export function rentStepSchema(now: Date = new Date()) {
  const fields = lettingFields(now);
  return z
    .object({ rent: fields.rent, availableFrom: fields.availableFrom })
    .transform(({ rent, availableFrom }) => ({ rentCents: rent, availableFrom }));
}

/**
 * Step 5, "The home": the type and bedrooms are needed; bathrooms, furnishing, BER and parking
 * are offered. The description and the facts renters ask about are the lister's own words, and
 * both pass the protected-ground check, with the problem said at the field (rule 3).
 */
export function homeStepSchema() {
  const fields = lettingFields();
  return z.object({
    propertyType: fields.propertyType,
    bedrooms: fields.bedrooms,
    bathrooms: fields.bathrooms,
    furnished: fields.furnished,
    berRating: fields.berRating,
    parking: fields.parking,
    description: fields.description,
    otherFacts: fields.otherFacts,
  });
}

/** The same fields, one group at a time, for the review's sheets (UX-LT-4). */
export const reviewGroups = ['address', 'rent', 'home', 'description'] as const;
export type ReviewGroup = (typeof reviewGroups)[number];

export function descriptionSchema() {
  const fields = lettingFields();
  return z.object({ description: fields.description, otherFacts: fields.otherFacts });
}

const stepFields = {
  address: ['addressLine1', 'addressLine2', 'area', 'county', 'eircode'],
  rent: ['rent', 'availableFrom'],
  home: [
    'propertyType',
    'bedrooms',
    'bathrooms',
    'furnished',
    'berRating',
    'parking',
    'description',
    'otherFacts',
  ],
  description: ['description', 'otherFacts'],
} as const;

/**
 * UX-FL-2, "Save and exit": what can be kept from a step that isn't finished. Each field that
 * reads cleanly on its own is kept; one that is empty or wrong is left as it was, and nothing
 * is cleared. So leaving half way through a step never loses what was typed properly.
 */
export function partialAnswers(
  step: CoreStep | 'description',
  values: Readonly<Record<string, string | undefined>>,
  now: Date = new Date(),
): Patch<DraftAnswers> {
  const fields = lettingFields(now);
  const kept: Record<string, unknown> = {};
  for (const field of stepFields[step]) {
    const typed = values[field];
    if (typed === undefined || typed.trim() === '') continue;
    const parsed = fields[field].safeParse(typed);
    if (!parsed.success || parsed.data === undefined) continue;
    kept[field === 'rent' ? 'rentCents' : field] = parsed.data;
  }
  return kept as Patch<DraftAnswers>;
}

/** What a step's form shows for what's known: the strings its fields start with. */
export function formValuesFrom(answers: DraftAnswers): Record<string, string> {
  const text = (value: string | number | undefined) => (value === undefined ? '' : String(value));
  return {
    addressLine1: text(answers.addressLine1),
    addressLine2: text(answers.addressLine2),
    area: text(answers.area),
    county: text(answers.county),
    eircode: text(answers.eircode),
    rent:
      answers.rentCents === undefined
        ? ''
        : (answers.rentCents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 }),
    availableFrom: text(answers.availableFrom),
    propertyType: text(answers.propertyType),
    bedrooms: text(answers.bedrooms),
    bathrooms: text(answers.bathrooms),
    furnished: text(answers.furnished),
    berRating: text(answers.berRating),
    parking: text(answers.parking),
    description: text(answers.description),
    otherFacts: (answers.otherFacts ?? []).join('\n'),
  };
}

/**
 * UX-LT-8 (Q31): a Daft or MyHome link in what was pasted. Gaff keeps it, to match enquiries to
 * this home, and never fetches the page. `alone` is true when the link is all that was given:
 * then the screen asks for the advert's words too.
 */
export function advertLinksIn(text: string): {
  daftUrl?: string;
  myhomeUrl?: string;
  alone: boolean;
} {
  const found: { daftUrl?: string; myhomeUrl?: string } = {};
  let rest = text;
  for (const match of text.matchAll(/https:\/\/[^\s<>"']+/gi)) {
    const link = match[0].replace(/[).,;]+$/, '');
    let host: string;
    try {
      host = new URL(link).hostname.toLowerCase();
    } catch {
      continue;
    }
    const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    if (is('daft.ie')) found.daftUrl ??= link;
    else if (is('myhome.ie')) found.myhomeUrl ??= link;
    else continue;
    rest = rest.replace(match[0], '');
  }
  const any = Boolean(found.daftUrl || found.myhomeUrl);
  return { ...found, alone: any && rest.trim() === '' };
}

/** What "Let it again" reads from the letting before: the home, and nothing about anyone. */
export interface HomeLetBefore {
  addressLine1: string;
  addressLine2: string | null;
  area: string;
  county: string;
  eircode: string | null;
  monthlyRentCents: number;
  propertyType: string;
  bedrooms: number;
  bathrooms: number | null;
  furnished: string | null;
  berRating: string | null;
  parking: string | null;
  description: string | null;
  /** The facts renters were answered from, in order. */
  facts: string[];
  criteria: Criteria | null;
  noSmokingIndoors: boolean;
}

/**
 * UX-LT-23: "Let it again" starts a new letting with everything from last time about the home:
 * the address, the facts, the description, the letting details and the last rent. Three things
 * are left for the person to give, because they are new each time: the date it's available, a
 * move-in date, and the advert links. Nothing about any renter, tenant or owner is read here.
 */
export function letAgainAnswers(previous: HomeLetBefore): DraftAnswers {
  const known = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined =>
    allowed.includes(value as T) ? (value as T) : undefined;
  const { moveInBy: _lastTime, ...criteria } = previous.criteria ?? { noPets: false };
  return withAnswers(
    {},
    {
      addressLine1: previous.addressLine1,
      addressLine2: previous.addressLine2 ?? undefined,
      area: previous.area,
      county: known(previous.county, counties),
      eircode: previous.eircode ?? undefined,
      rentCents: previous.monthlyRentCents,
      propertyType: known(previous.propertyType, keys(propertyTypes)),
      bedrooms: previous.bedrooms,
      bathrooms: previous.bathrooms ?? undefined,
      furnished: known(previous.furnished, keys(furnishing)),
      berRating: known(previous.berRating, berRatings),
      parking: known(previous.parking, keys(parkingOptions)),
      description: previous.description ?? undefined,
      otherFacts: previous.facts.slice(0, 20),
      criteria: previous.criteria ? criteria : undefined,
      noSmokingIndoors: previous.noSmokingIndoors || undefined,
    },
  );
}
