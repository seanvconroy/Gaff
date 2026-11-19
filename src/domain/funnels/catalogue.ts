/**
 * UX-ME-1, UX-ME-2: every funnel in section 9 of the UX redesign ("A funnel and a target for each
 * key flow"), as an ordered list of step codes. Funnels are counted from Gaff's own events; there
 * is no analytics vendor.
 *
 * A step gets its fact from one of two places:
 *
 * - `record`: an event a use case already writes to a letting's record (ADR-0006). The catalogue
 *   maps it to the step, so the same fact is never written twice.
 * - `funnel`: a product-wide funnel event, written under the step's own code with
 *   `recordFunnelStep` (src/server/funnels). This is for steps the record has no event for, and
 *   for steps that belong to no letting or organisation, such as opening the sign-in screen.
 *
 * Flows that aren't built yet (search, asking to view, saved search, profile, on Gaff, import,
 * inviting a team) are here too, with `funnel` steps. The package that builds one only has to
 * emit its codes, as the forwarding flow does (`src/server/enquiries/forwarding.ts`).
 */

import type { OrganisationKind } from '@/domain/organisations/kinds';

/** What is counted at each step of a funnel: each one counts once per step. */
export const subjectKinds = [
  /** One try at signing in, from opening the screen. Not a person: nobody is known yet. */
  'attempt',
  'person',
  'organisation',
  'letting',
  'application',
  'check',
  'approval',
  /** One search. Searches are counted, not kept against a person (UX-ME-4). */
  'search',
  /** One visit to a screen. */
  'visit',
] as const;
export type SubjectKind = (typeof subjectKinds)[number];

/** Which ID on a record event is the funnel's subject. */
export type RecordSubject = 'organisation' | 'letting' | 'actor' | { readonly data: string };

export interface RecordSource {
  readonly from: 'record';
  /** The event's type in the record's catalogue (src/server/record/events.ts). */
  readonly event: string;
  /** Payload fields that must match: one value, or any of a list of codes. */
  readonly where?: Readonly<Record<string, string | boolean | readonly string[]>>;
  readonly subject: RecordSubject;
  /** The payload field that holds the funnel's split, such as the portal an enquiry came from. */
  readonly variant?: string;
  /** Count only events of organisations of this kind. */
  readonly organisationKind?: OrganisationKind;
}

export interface FunnelSource {
  readonly from: 'funnel';
}

export type StepSource = RecordSource | FunnelSource;

export interface FunnelStep {
  readonly code: string;
  readonly label: string;
  readonly sources: readonly StepSource[];
  /** The earlier step (its code) that the median time to this step is counted from. */
  readonly timedFrom?: string;
}

export interface Funnel {
  readonly code: string;
  readonly label: string;
  /** Section 9's measure and target for the flow. Targets are hypotheses until baselines exist. */
  readonly measure: string;
  readonly target: string;
  readonly subject: SubjectKind;
  /** What the funnel is split by, such as the sign-in method. Each step may carry its code. */
  readonly split?: string;
  readonly steps: readonly FunnelStep[];
}

const own: FunnelSource = { from: 'funnel' };

function record(
  event: string,
  subject: RecordSubject,
  options: Omit<RecordSource, 'from' | 'event' | 'subject'> = {},
): RecordSource {
  return { from: 'record', event, subject, ...options };
}

const sent = (kind: string | readonly string[], subject: RecordSubject) =>
  record('message.sent', subject, { where: { kind } });

export const funnels = [
  {
    code: 'sign_in',
    label: 'Sign-in',
    measure: 'Completion; split by method',
    target: '90% of people who choose a method finish. Median under 30 seconds',
    subject: 'attempt',
    split: 'Method',
    steps: [
      { code: 'screen_opened', label: 'Screen opened', sources: [own] },
      { code: 'method_chosen', label: 'Method chosen', sources: [own], timedFrom: 'screen_opened' },
      { code: 'signed_in', label: 'Signed in', sources: [own], timedFrom: 'method_chosen' },
    ],
  },
  {
    code: 'first_run',
    label: 'First run',
    measure: 'Completion; time',
    target: '90%. Median under 60 seconds for a landlord, 2 minutes for an agency',
    subject: 'person',
    split: 'Role',
    steps: [
      { code: 'signed_in', label: 'Signed in', sources: [own] },
      {
        code: 'set_up_finished',
        label: 'Set-up finished',
        // UX-AC-6: someone who lets finishes by making their organisation, which the record
        // holds (an agency, or a private landlord's silent one). A renter makes none, and
        // neither does someone a founder invited, so that is written as a step of its own.
        sources: [own, record('organisation.created', 'actor', { variant: 'kind' })],
        timedFrom: 'signed_in',
      },
    ],
  },
  {
    code: 'add_letting',
    label: 'Adding a letting',
    measure: 'Share going live within 24 hours; active time from start to live',
    target: '75%. Median under 3 minutes with import, under 6 without (R1 allows 10)',
    subject: 'letting',
    split: 'Started with',
    steps: [
      { code: 'started', label: 'Started', sources: [record('letting.created', 'letting')] },
      { code: 'draft_reviewed', label: 'Draft reviewed', sources: [own], timedFrom: 'started' },
      {
        code: 'live',
        label: 'Live',
        sources: [record('letting.went_live', 'letting')],
        timedFrom: 'started',
      },
    ],
  },
  {
    code: 'import',
    label: 'Import',
    measure: 'Share of lettings started by import; fields changed on review',
    target: '70% use import. Two or fewer fields changed',
    subject: 'letting',
    steps: [
      { code: 'source_given', label: 'Something pasted or uploaded', sources: [own] },
      {
        code: 'review_confirmed',
        label: 'Review confirmed',
        sources: [own],
        timedFrom: 'source_given',
      },
    ],
  },
  {
    code: 'forwarding',
    label: 'Forwarding',
    measure: 'Completion on the first day',
    target: '80%',
    subject: 'organisation',
    steps: [
      { code: 'flow_opened', label: 'Flow opened', sources: [own] },
      { code: 'rule_in_place', label: 'Rule in place', sources: [own], timedFrom: 'flow_opened' },
      { code: 'test_answered', label: 'Test answered', sources: [own], timedFrom: 'flow_opened' },
    ],
  },
  {
    code: 'activation',
    label: 'Activation',
    measure: 'Share; time',
    target: '60% within 7 days',
    subject: 'organisation',
    steps: [
      {
        code: 'signed_up',
        label: 'Signed up',
        sources: [record('organisation.created', 'organisation')],
      },
      {
        code: 'first_enquiry_answered',
        label: 'First real enquiry answered',
        sources: [sent('first_reply', 'organisation')],
        timedFrom: 'signed_up',
      },
    ],
  },
  {
    code: 'on_gaff',
    label: 'On Gaff',
    measure: 'Share of live lettings shown on Gaff',
    target: '90%',
    subject: 'letting',
    steps: [
      { code: 'live', label: 'Letting live', sources: [record('letting.went_live', 'letting')] },
      { code: 'shown', label: 'Shown on Gaff', sources: [own], timedFrom: 'live' },
    ],
  },
  {
    code: 'invite_team',
    label: 'Inviting a team',
    measure: 'Share of agencies; acceptance',
    target: 'Half of agencies send one by their second letting. 70% accepted',
    subject: 'organisation',
    steps: [
      {
        code: 'admin_activated',
        label: 'Admin activated',
        sources: [
          record('message.sent', 'organisation', {
            where: { kind: 'first_reply' },
            organisationKind: 'agency',
          }),
        ],
      },
      { code: 'invite_sent', label: 'Invite sent', sources: [own], timedFrom: 'admin_activated' },
      {
        code: 'invite_accepted',
        label: 'Invite accepted',
        sources: [own],
        timedFrom: 'invite_sent',
      },
    ],
  },
  {
    code: 'home',
    label: 'Home',
    measure: 'Share of visits where the first tap is a "Needs you" row; time to clear an item',
    target: '70%. 80% of items cleared within 4 working hours',
    subject: 'visit',
    split: 'First tap',
    steps: [
      { code: 'today_opened', label: 'Today opened', sources: [own] },
      { code: 'first_tap', label: 'First tap', sources: [own], timedFrom: 'today_opened' },
    ],
  },
  {
    code: 'first_decision',
    label: 'First decision',
    measure: 'Time; time spent in the decision flow',
    target: 'Median under 48 hours from enough answers. Under 2 minutes in the flow',
    subject: 'letting',
    steps: [
      { code: 'live', label: 'Live', sources: [record('letting.went_live', 'letting')] },
      {
        code: 'who_views_decided',
        label: 'Who views decided',
        sources: [record('shortlist.decided', 'letting')],
        timedFrom: 'live',
      },
    ],
  },
  {
    code: 'offer',
    label: 'Offer',
    measure: 'Time at each step',
    target: 'Owner answers within 24 hours for 80%. Offer sent within 4 working hours of approval',
    subject: 'letting',
    steps: [
      { code: 'checks_back', label: 'Checks back', sources: [own] },
      {
        code: 'owner_approved',
        label: 'Owner approved',
        // The owner's answer by their link; or the operator recording that the owner already
        // approved (UX-DC-15), which counts as the owner's answer; or, for a private landlord,
        // who is the owner, their own offer.
        sources: [
          record('landlord.approval_answered', 'letting', { where: { preferred: 'approved' } }),
          record('landlord.approval_confirmed', 'letting'),
          record('offer.made', 'letting', { organisationKind: 'private_landlord' }),
        ],
        timedFrom: 'checks_back',
      },
      {
        code: 'offer_sent',
        label: 'Offer sent',
        sources: [record('offer.made', 'letting')],
        timedFrom: 'owner_approved',
      },
    ],
  },
  {
    code: 'search',
    label: 'Search',
    measure: 'Share of searches with at least one home that fits; share that open a home',
    target: '70% find a fit. 50% open a home',
    subject: 'search',
    split: 'Result',
    steps: [
      { code: 'search_made', label: 'Search made', sources: [own] },
      { code: 'home_opened', label: 'A home opened', sources: [own], timedFrom: 'search_made' },
    ],
  },
  {
    code: 'ask_to_view',
    label: 'Asking to view',
    measure: 'Completion from press to sent; confirmation; time',
    target:
      '75% of those who press finish. 85% confirm. Under 60 seconds new, under 10 with a profile',
    subject: 'visit',
    split: 'Profile',
    steps: [
      { code: 'home_opened', label: 'Home opened', sources: [own] },
      { code: 'pressed', label: '"Ask to view" pressed', sources: [own] },
      { code: 'sent', label: 'Sent', sources: [own], timedFrom: 'pressed' },
      { code: 'email_confirmed', label: 'Email confirmed', sources: [own], timedFrom: 'sent' },
    ],
  },
  {
    code: 'saved_search',
    label: 'Saved search',
    measure: 'Share of empty searches saved',
    target: '30%',
    subject: 'search',
    steps: [
      { code: 'no_result', label: 'No result', sources: [own] },
      { code: 'saved', label: 'Search saved', sources: [own] },
      { code: 'alert_opened', label: 'Alert opened', sources: [own], timedFrom: 'saved' },
      {
        code: 'asked_to_view',
        label: 'Asked to view',
        sources: [own],
        timedFrom: 'alert_opened',
      },
    ],
  },
  {
    code: 'profile',
    label: 'Profile',
    measure: 'Share of applicants who keep their details; share of passed ID checks kept',
    target: '40%. 70%',
    subject: 'person',
    split: 'What was offered',
    steps: [
      { code: 'offered', label: 'Offered', sources: [own] },
      { code: 'kept', label: 'Kept', sources: [own] },
    ],
  },
  {
    code: 'enquiry_sources',
    label: 'Where enquiries come from',
    measure: 'Share made on Gaff',
    target: 'Rising month on month. No target yet',
    subject: 'application',
    split: 'Source',
    steps: [
      {
        code: 'enquiry',
        label: 'All enquiries',
        sources: [record('enquiry.received', { data: 'applicationId' }, { variant: 'portal' })],
      },
    ],
  },
  {
    code: 'renter_questions',
    label: 'Renter: questions',
    measure: 'Completion; time',
    target: '80% of those who open. Under 45 seconds',
    subject: 'application',
    steps: [
      {
        code: 'first_reply_delivered',
        label: 'First reply delivered',
        sources: [sent('first_reply', { data: 'applicationId' })],
      },
      { code: 'page_opened', label: 'Page opened', sources: [own] },
      {
        code: 'answers_sent',
        label: 'Answers sent',
        sources: [record('application.answered', { data: 'applicationId' })],
        timedFrom: 'page_opened',
      },
    ],
  },
  {
    code: 'renter_booking',
    label: 'Renter: booking',
    measure: 'Completion; no-shows',
    target: '85% of those who open. No-shows below each pilot’s baseline',
    subject: 'application',
    steps: [
      {
        code: 'invitation_delivered',
        label: 'Invitation delivered',
        sources: [sent(['invitation', 'place_offered'], { data: 'applicationId' })],
      },
      { code: 'opened', label: 'Opened', sources: [own] },
      {
        code: 'booked',
        label: 'Booked',
        sources: [record('viewing.booked', 'actor')],
        timedFrom: 'opened',
      },
    ],
  },
  {
    code: 'renter_applying',
    label: 'Renter: applying',
    measure: 'Completion',
    target: '85% of those who open',
    subject: 'application',
    steps: [
      {
        code: 'invited',
        label: 'Invited to apply',
        sources: [sent('apply_invitation', { data: 'applicationId' })],
      },
      { code: 'opened', label: 'Opened', sources: [own] },
      {
        code: 'sent',
        label: 'Sent',
        sources: [record('application.submitted', { data: 'applicationId' })],
        timedFrom: 'opened',
      },
    ],
  },
  {
    code: 'renter_checks',
    label: 'Renter: checks',
    measure: 'Completion within 48 hours',
    target: '80%',
    subject: 'application',
    steps: [
      {
        code: 'asked',
        label: 'Asked',
        sources: [record('checks.requested', { data: 'applicationId' })],
      },
      { code: 'all_done', label: 'All three done', sources: [own], timedFrom: 'asked' },
    ],
  },
  {
    code: 'renter_offer',
    label: 'Renter: offer',
    measure: 'Share answered',
    target: '95%',
    subject: 'application',
    steps: [
      {
        code: 'offer_delivered',
        label: 'Offer delivered',
        sources: [sent('offer', { data: 'applicationId' })],
      },
      {
        code: 'answered',
        label: 'Answered before the deadline',
        sources: [record('offer.accepted', 'actor'), record('offer.declined', 'actor')],
        timedFrom: 'offer_delivered',
      },
    ],
  },
  {
    code: 'referee',
    label: 'Referee',
    measure: 'Completion within 3 days; time',
    target: '75%. Median under 2 minutes',
    subject: 'check',
    steps: [
      {
        code: 'request_delivered',
        label: 'Request delivered',
        sources: [sent('reference_request', { data: 'checkId' })],
      },
      { code: 'opened', label: 'Opened', sources: [own] },
      {
        code: 'sent',
        label: 'Sent',
        sources: [
          record('check.completed', { data: 'checkId' }, { where: { outcome: 'answered' } }),
        ],
        timedFrom: 'opened',
      },
    ],
  },
  {
    code: 'owner',
    label: 'Owner',
    measure: 'Time to approve',
    target: '80% within 24 hours',
    subject: 'approval',
    steps: [
      {
        code: 'link_sent',
        label: 'Link sent',
        sources: [record('landlord.approval_requested', { data: 'approvalId' })],
      },
      { code: 'opened', label: 'Opened', sources: [own] },
      {
        code: 'approval_given',
        label: 'Approval given',
        sources: [record('landlord.approval_answered', { data: 'approvalId' })],
        timedFrom: 'link_sent',
      },
    ],
  },
  // The two below aren't in section 9's funnel table. They cover the pilot measure "days from
  // first enquiry to signed tenancy" and the tenancy steps, from events the record already holds.
  {
    code: 'letting',
    label: 'Enquiry to signed tenancy',
    measure: 'Days from first enquiry to signed tenancy (a pilot measure)',
    target: 'At least 30% fewer than their usual',
    subject: 'letting',
    steps: [
      {
        code: 'first_enquiry',
        label: 'First enquiry',
        sources: [record('enquiry.received', 'letting')],
      },
      {
        code: 'who_views_decided',
        label: 'Who views decided',
        sources: [record('shortlist.decided', 'letting')],
        timedFrom: 'first_enquiry',
      },
      {
        code: 'applicants_chosen',
        label: 'Applicants chosen',
        sources: [record('applicants.chosen', 'letting')],
        timedFrom: 'who_views_decided',
      },
      {
        code: 'offer_accepted',
        label: 'Offer accepted',
        sources: [record('offer.accepted', 'letting')],
        timedFrom: 'applicants_chosen',
      },
      {
        code: 'agreement_signed',
        label: 'Agreement signed',
        sources: [record('agreement.signed', 'letting')],
        timedFrom: 'first_enquiry',
      },
    ],
  },
  {
    code: 'tenancy',
    label: 'Tenancy steps and close',
    measure: 'Completion of each step after the offer is accepted',
    target: 'No target yet',
    subject: 'letting',
    steps: [
      {
        code: 'offer_accepted',
        label: 'Offer accepted',
        sources: [record('offer.accepted', 'letting')],
      },
      {
        code: 'agreement_signed',
        label: 'Agreement signed',
        sources: [record('agreement.signed', 'letting')],
        timedFrom: 'offer_accepted',
      },
      {
        code: 'payment_received',
        label: 'Payment received',
        sources: [record('payment.received', 'letting')],
        timedFrom: 'agreement_signed',
      },
      {
        code: 'rtb_registered',
        label: 'Registered with the RTB',
        sources: [record('tenancy.rtb_registered', 'letting')],
        timedFrom: 'offer_accepted',
      },
      {
        code: 'finished',
        label: 'Letting finished',
        sources: [record('letting.finished', 'letting')],
        timedFrom: 'offer_accepted',
      },
    ],
  },
  // BA-8 (AU4, Q66): not a funnel, a count. Each time a Google or Apple sign-in couldn't be
  // joined to anyone, because the provider doesn't host the address, one try is counted, split
  // by the provider, with the reason `not_joined` and nothing about the person.
  {
    code: 'account',
    label: 'Sign-in not joined',
    measure: 'Google or Apple sign-ins refused because the provider doesn’t host the address',
    target: 'Few: a lot means the rule gets in people’s way',
    subject: 'attempt',
    split: 'Method',
    steps: [{ code: 'sign_in_failed', label: 'Not joined', sources: [own] }],
  },
] as const satisfies readonly Funnel[];

type Catalogue = typeof funnels;

type StepCodesOf<F> = F extends {
  readonly code: infer C extends string;
  readonly steps: infer S extends readonly unknown[];
}
  ? {
      [K in keyof S]: S[K] extends { readonly code: infer SC extends string }
        ? `${C}.${SC}`
        : never;
    }[number]
  : never;

type DirectStepCodesOf<F> = F extends {
  readonly code: infer C extends string;
  readonly steps: infer S extends readonly unknown[];
}
  ? {
      [K in keyof S]: S[K] extends {
        readonly code: infer SC extends string;
        readonly sources: readonly (infer Source)[];
      }
        ? FunnelSource extends Source
          ? `${C}.${SC}`
          : never
        : never;
    }[number]
  : never;

/** Every step's full code: its funnel's code, a dot, its own code. */
export type FunnelStepCode = StepCodesOf<Catalogue[number]>;
/** The steps written as funnel events. The rest are counted from the record. */
export type DirectStepCode = DirectStepCodesOf<Catalogue[number]>;

export function stepCode(funnel: Pick<Funnel, 'code'>, step: Pick<FunnelStep, 'code'>): string {
  return `${funnel.code}.${step.code}`;
}

const catalogue: readonly Funnel[] = funnels;

const directSteps = new Map<string, Funnel>(
  catalogue.flatMap((funnel) =>
    funnel.steps
      .filter((step) => step.sources.some((source) => source.from === 'funnel'))
      .map((step) => [stepCode(funnel, step), funnel] as const),
  ),
);

/** The steps a use case may write as funnel events. */
export const directStepCodes = [...directSteps.keys()] as DirectStepCode[];

export function isDirectStep(code: string): code is DirectStepCode {
  return directSteps.has(code);
}

/** The funnel a direct step belongs to, for its subject kind. */
export function funnelOfDirectStep(code: DirectStepCode): Funnel {
  return directSteps.get(code)!;
}

/** Each step counted from the record, with the event that feeds it. */
export function recordSources(): Array<{ step: string; source: RecordSource }> {
  return catalogue.flatMap((funnel) =>
    funnel.steps.flatMap((step) =>
      step.sources
        .filter((source): source is RecordSource => source.from === 'record')
        .map((source) => ({ step: stepCode(funnel, step), source })),
    ),
  );
}
