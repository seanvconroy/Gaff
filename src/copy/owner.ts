import { formatRatio } from '@/domain/applications/apply';
import { lettingDetailsParts, type Criteria } from '@/domain/criteria/criteria';
import type { FigureCode, LetSummary, OwnerFigure, Standing } from '@/domain/landlord/owner-page';
import { formatDate, formatDateTime, formatRent } from '@/lib/format';
import { possessive } from './templates/first-reply';

/**
 * Every word on an owner's own pages (section 5 of the UX redesign, "Owners"; UX-OP-1 to
 * UX-OP-9), and the agent's words for sharing a letting with them (UX-OW-1, UX-OW-2, UX-OW-4).
 * Plain, warm Irish English: short sentences, no jargon, no exclamation marks, no blame. Every
 * page ends with what happens next, and when.
 *
 * A renter is "Applicant 1" here, and never anything more, until the chosen tenant and the
 * backup are put to the owner to approve (UX-OP-2, Q4). Nothing here invites an owner to use
 * Gaff (UX-PP-9, Q45), and no line hedges or disclaims (Q46).
 *
 * The emails an owner gets are fixed templates (src/copy/templates), and aren't here.
 */

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`);
const days = (n: number) => (n === 0 ? 'Less than a day' : n === 1 ? '1 day' : `${n} days`);

/** Who did a step, as the page says it. */
export type Actor =
  | { kind: 'person'; name: string }
  | { kind: 'applicant'; label: string }
  | { kind: 'owner' }
  | { kind: 'gaff' };

interface Step {
  type: string;
  data: Record<string, unknown>;
  at: Date;
  actor: Actor;
}

const nameOf = (actor: Actor): string =>
  actor.kind === 'person'
    ? actor.name
    : actor.kind === 'applicant'
      ? actor.label
      : actor.kind === 'owner'
        ? 'You'
        : 'Gaff';

const figureLabels: Record<FigureCode, string> = {
  enquiries: 'Enquiries',
  answered: 'Answered the questions',
  meet_everything: 'Meet everything asked',
  invited: 'Invited to view',
  booked: 'Places booked',
  waitlisted: 'On the waiting list',
  came: 'Came to view',
  applied: 'Applied',
  checks_done: 'Checks back',
};

function approvalAnswer(data: Record<string, unknown>): string {
  const first =
    data.preferred === 'approved' ? 'You approved the tenant' : 'You declined the tenant';
  if (data.backup === null || data.backup === undefined) return `${first}.`;
  if (data.backup === data.preferred) return `${first} and the backup.`;
  return `${first}. You ${data.backup === 'approved' ? 'approved' : 'declined'} the backup.`;
}

export const ownerCopy = {
  metaTitle: (address: string) => `Your letting: ${address}`,

  /** The link has expired or been switched off. It names nobody. */
  ended: {
    title: 'This link has ended',
    text: 'Ask your letting agent for a new one.',
  },

  /** UX-OP-1: where it stands, in one sentence or two. */
  standing(standing: Standing, operator: string): string {
    switch (standing.code) {
      case 'setting_up':
        return `${operator} is getting the home ready to let.`;
      case 'no_enquiries':
        return 'The home is live. No enquiries yet.';
      case 'enquiries':
        return `Enquiries are coming in. ${standing.enquiries} so far.`;
      case 'viewings':
        return standing.places > 0
          ? `Viewings are under way. ${standing.booked} of ${standing.places} places are booked.`
          : 'People have been invited to view.';
      case 'applications':
        return standing.applied === 1
          ? '1 person has applied.'
          : `${standing.applied} people have applied.`;
      case 'checks':
        return `${operator} has chosen a tenant. The checks are under way.`;
      case 'approval_asked':
        return `${operator} has chosen a tenant and asked you to approve.`;
      case 'approved':
        return `You approved the tenant. ${operator} makes the offer next.`;
      case 'declined':
        return `You declined the tenant ${operator} chose.`;
      case 'offer_out':
        return 'The home has been offered. The answer isn’t in yet.';
      case 'offer_not_taken':
        return 'The offer wasn’t taken up.';
      case 'let':
        return 'The home is let.';
      case 'withdrawn':
        return 'This letting has been withdrawn.';
    }
  },

  /** The four parts, for screen readers. */
  progress: 'Where the letting is',

  figures: {
    label: 'The figures',
    name: (code: FigureCode) => figureLabels[code],
    value: (figure: OwnerFigure) =>
      figure.of === undefined ? String(figure.value) : `${figure.value} of ${figure.of}`,
  },

  decided: {
    title: 'What’s been decided',
    none: 'Nothing yet.',
  },

  /**
   * One decision: what was decided, then who decided, when and on what. An agent's own people
   * are named; a renter never is.
   */
  decision(step: Step, now: Date = new Date()): { what: string; by: string } {
    const { data } = step;
    const who = nameOf(step.actor);
    const on = `on ${formatDate(step.at, now)}`;
    switch (step.type) {
      case 'letting.went_live':
        return { what: 'The home went live.', by: `Confirmed by ${who} ${on}.` };
      case 'shortlist.decided':
        return {
          what: `${people(Number(data.invited))} invited to view.${
            Number(data.waitlisted) > 0 ? ` ${Number(data.waitlisted)} on the waiting list.` : ''
          }`,
          by: `Chosen by ${who} ${on}, from the ranked list.`,
        };
      case 'applicants.chosen':
        return {
          what: data.withBackup ? 'A tenant and a backup chosen.' : 'A tenant chosen.',
          by: `Chosen by ${who} ${on}, from ${
            Number(data.applied) === 1 ? '1 application' : `${Number(data.applied)} applications`
          }.`,
        };
      case 'landlord.approval_answered':
        return { what: approvalAnswer(data), by: `Your answer ${on}.` };
      case 'offer.made':
        return data.role === 'backup'
          ? {
              what: 'The home was offered to the backup.',
              by: `Sent ${on}, as agreed when the first offer was made.`,
            }
          : {
              what: 'The home was offered.',
              by: `Offered by ${who} ${on}, with ${Number(data.deadlineHours)} hours to answer.`,
            };
      case 'offer.accepted':
        return { what: 'The offer was accepted.', by: `Accepted ${on}.` };
      case 'offer.declined':
        return { what: 'The offer was declined.', by: `Declined ${on}.` };
      case 'offer.expired':
        return { what: 'The offer wasn’t answered in time.', by: `It closed ${on}.` };
      case 'agreement.signed':
        return {
          what:
            data.mode === 'paper'
              ? 'The tenancy agreement was signed on paper.'
              : 'The tenancy agreement was signed.',
          by: `Signed for you by ${who} ${on}.`,
        };
      case 'letting.closed':
        return {
          what:
            data.outcome === 'let'
              ? 'The letting was closed as let.'
              : 'The letting was withdrawn.',
          by: `Closed by ${who} ${on}.`,
        };
      default:
        return { what: 'A decision was made.', by: `By ${who} ${on}.` };
    }
  },

  details: {
    title: 'Letting details',
    /** UX-OP-1: what's asked of renters, on one line. */
    line: (criteria: readonly string[]) =>
      criteria.length > 0
        ? criteria.join(' · ')
        : 'Nothing is asked of renters. Everyone is ranked by when they enquired.',
  },

  everything: {
    summary: 'See everything that’s happened',
    none: 'Nothing has happened yet.',
  },

  /**
   * UX-OP-3: one step of the record, as an owner reads it. Only steps the record keeps for an
   * owner reach here (`OWNER_RECORD`); anything else reads as nothing.
   */
  recordLine(step: Step, now: Date = new Date()): { what: string; detail?: string } | null {
    const { data } = step;
    switch (step.type) {
      case 'enquiry.received':
        return {
          what: 'An enquiry arrived',
          detail:
            data.portal === 'daft'
              ? 'Through Daft'
              : data.portal === 'myhome'
                ? 'Through MyHome'
                : undefined,
        };
      case 'application.answered':
        return { what: data.changed ? 'Changed their answers' : 'Answered the questions' };
      case 'shortlist.decided':
        return {
          what: `${people(Number(data.invited))} invited to view`,
          detail: `${Number(data.waitlisted)} on the waiting list, ${Number(data.notInvited)} told they’ll hear back`,
        };
      case 'waitlist.offered':
        return { what: 'A freed place was offered to the waiting list' };
      case 'viewings.session_added':
        return {
          what: 'A viewing time was added',
          detail:
            data.kind === 'group'
              ? `A group viewing for up to ${Number(data.places)}`
              : `${Number(data.slots)} places, one booking each`,
        };
      case 'viewings.session_removed':
        return { what: 'A viewing time was removed' };
      case 'viewing.booked':
        return { what: data.rescheduled ? 'Moved their viewing' : 'Booked a viewing' };
      case 'viewing.cancelled':
        return { what: 'Cancelled their viewing' };
      case 'viewing.attendance_marked':
        return {
          what: data.attended
            ? 'Someone was marked as having come'
            : 'Someone was marked as not having come',
        };
      case 'application.submitted':
        return { what: data.changed ? 'Changed their application' : 'Applied' };
      case 'applicants.chosen':
        return {
          what: data.withBackup ? 'A tenant and a backup were chosen' : 'A tenant was chosen',
          detail:
            Number(data.applied) === 1
              ? 'From 1 application'
              : `From ${Number(data.applied)} applications`,
        };
      case 'letting.went_live':
        return { what: 'The home went live' };
      case 'criteria.set': {
        const lines = lettingDetailsParts(data as unknown as Criteria, false, now);
        return {
          what: 'What’s asked of renters was set',
          detail: lines.length > 0 ? lines.join(' · ') : 'Nothing asked',
        };
      }
      case 'letting.rent_changed':
        return {
          what: 'The rent was changed',
          detail: `From ${formatRent(Number(data.fromCents))} to ${formatRent(Number(data.toCents))}`,
        };
      case 'landlord.approval_requested':
        return { what: 'You were asked to approve' };
      case 'landlord.approval_answered':
        return { what: approvalAnswer(data).replace(/\.$/, '') };
      case 'offer.made':
        return {
          what:
            data.role === 'backup' ? 'The home was offered to the backup' : 'The home was offered',
          detail: `${Number(data.deadlineHours)} hours to answer`,
        };
      case 'offer.accepted':
        return { what: 'Accepted the offer' };
      case 'offer.declined':
        return { what: 'Declined the offer' };
      case 'offer.expired':
        return { what: 'The offer wasn’t answered in time' };
      case 'agreement.signed':
        return {
          what:
            data.mode === 'paper'
              ? 'The tenancy agreement was signed on paper'
              : 'The tenancy agreement was signed',
        };
      case 'tenancy.rtb_registered':
        return { what: 'The tenancy was registered with the RTB' };
      case 'letting.closed':
        return {
          what:
            data.outcome === 'let' ? 'The letting was closed as let' : 'The letting was withdrawn',
        };
      case 'letting.finished':
        return { what: 'The letting was finished' };
      default:
        return null;
    }
  },
  who: nameOf,
  when: (at: Date, now: Date = new Date()) => formatDateTime(at, now),

  /** UX-PP-2: what happens next, and when. One or two sentences, once, at the foot of the page. */
  next(
    standing: Standing,
    input: {
      operator: string;
      nextViewingAt: Date | null;
      offerClosesAt: Date | null;
      summary: LetSummary | null;
    },
    now: Date = new Date(),
  ): string {
    const { operator } = input;
    switch (standing.code) {
      case 'setting_up':
        return 'When the home goes live, this page shows the enquiries as they arrive.';
      case 'no_enquiries':
      case 'enquiries':
        return input.nextViewingAt
          ? `Next, ${operator} chooses who to invite to view. The first viewing is on ${formatDateTime(input.nextViewingAt, now)}.`
          : `Next, ${operator} chooses who to invite to view. This page shows it as soon as it’s decided.`;
      case 'viewings':
        return input.nextViewingAt
          ? `The next viewing is on ${formatDateTime(input.nextViewingAt, now)}. After each viewing, the people who came are invited to apply.`
          : `The people who came to view are invited to apply. Then ${operator} chooses a tenant.`;
      case 'applications':
        return `Next, ${operator} chooses a tenant and a backup, and checks them. Then you’ll get an email asking you to approve.`;
      case 'checks':
        return `When the checks are back, ${operator} emails you a summary of the tenant to approve.`;
      case 'approval_asked':
        return `Open the link in the email from ${operator} to see the summary and answer. Nothing is offered until you do.`;
      case 'approved':
        return `${operator} makes the offer next. This page shows the answer when it comes.`;
      case 'declined':
        return `${operator} will be in touch.`;
      case 'offer_out':
        return input.offerClosesAt
          ? `The offer closes on ${formatDateTime(input.offerClosesAt, now)}. This page shows the answer when it comes.`
          : 'This page shows the answer when it comes.';
      case 'offer_not_taken':
        return `${operator} will be in touch about what happens next.`;
      case 'let':
        return input.summary?.startDate && !input.summary.rtbRegisteredAt
          ? `${operator} registers the tenancy with the RTB within a month of ${formatDate(input.summary.startDate, now)}. The date will show here.`
          : 'That’s everything for this letting.';
      case 'withdrawn':
        return `${operator} isn’t letting this home now. Nothing else will happen here.`;
    }
  },

  /** UX-OP-5: the summary once the home is let. */
  summary: {
    label: 'Summary',
    rows(summary: LetSummary, now: Date = new Date()): Array<{ label: string; value: string }> {
      return [
        ...(summary.daysToLet === null
          ? []
          : [{ label: 'Let in', value: days(summary.daysToLet) }]),
        { label: 'Rent', value: formatRent(summary.rentCents) },
        ...(summary.startDate
          ? [{ label: 'Tenancy starts', value: formatDate(summary.startDate, now) }]
          : []),
        ...(summary.startDate
          ? [
              {
                label: 'Registered with the RTB',
                value: summary.rtbRegisteredAt
                  ? formatDate(summary.rtbRegisteredAt, now)
                  : 'Not yet',
              },
            ]
          : []),
      ];
    },
  },
} as const;

/** What a check found, as an owner reads it: a few plain words, never an amount (UX-OP-7). */
export interface CheckToDescribe {
  kind: string;
  status: string;
  /** Why a reference has no answer, as a code. */
  reason: string | null;
  /** A referee's answers in plain words. */
  summary: string | null;
  incomeConfirmed: { ratioTenths: number; meetsRule: boolean } | null;
}

const checkNames: Record<string, string> = {
  identity: 'ID',
  income: 'Income check',
  landlord_reference: 'Previous landlord',
  employer_reference: 'Employer',
};

/**
 * Every word of the approval (UX-OP-6 to UX-OP-9; R19): one person per screen, the chosen tenant
 * and then the backup. Names appear here and nowhere earlier (Q4). Declining asks for no reason
 * (Q42).
 */
export const approvalCopy = {
  metaTitle: (address: string) => `Approve a tenant for ${address}`,
  ended: {
    title: 'This link has ended',
    text: 'The choice may have changed. Ask your letting agent for a new link.',
  },
  preferred: {
    title: 'Approve a tenant',
    lead: (operator: string, name: string) =>
      `${operator} has chosen ${name} from the people who viewed and applied.`,
  },
  backup: {
    title: 'And a backup?',
    /** One sentence on what a backup is for. */
    lead: (operator: string, preferred: string, backup: string) =>
      `If ${preferred} doesn’t take the home, ${operator} offers it to ${backup}.`,
  },
  rows: {
    asked: 'What was asked',
    income: 'Take-home income',
  },
  meets: (person: { met: number; total: number; answered: boolean }) =>
    person.total === 0
      ? 'Nothing was asked'
      : person.answered
        ? `Meets ${person.met} of ${person.total}`
        : 'Hasn’t answered',
  /** Income against the rent, never the amount. */
  income: (income: { ratioTenths: number } | null) =>
    income ? `${formatRatio(income.ratioTenths)} times the rent` : 'Not given',
  checkName: (kind: string) => checkNames[kind] ?? 'Check',
  /** UX-OP-7: each check in words. One that isn't finished says "Still under way". */
  check(check: CheckToDescribe, ruleTenths: number): string {
    switch (check.status) {
      case 'passed':
        if (check.kind === 'identity') return 'Verified';
        if (!check.incomeConfirmed) return 'Confirmed';
        return check.incomeConfirmed.meetsRule
          ? `Confirmed: ${formatRatio(check.incomeConfirmed.ratioTenths)} times the rent`
          : `Confirmed: ${formatRatio(check.incomeConfirmed.ratioTenths)} times the rent, under the ${formatRatio(ruleTenths)} asked`;
      case 'not_passed':
        return 'Not confirmed';
      case 'answered':
        return (check.summary ?? 'Answered').replace(/\.$/, '');
      case 'no_answer':
        return check.reason === 'cant_give'
          ? 'Couldn’t give a reference'
          : 'No answer after two reminders';
      case 'not_needed':
        return check.kind === 'landlord_reference' ? 'Hasn’t rented before' : 'No employer to ask';
      default:
        return 'Still under way';
    }
  },
  /** The basis, once, under the card: the same for everyone. */
  basis: (operator: string, criteria: readonly string[], ruleTenths: number) =>
    [
      ...(criteria.length > 0 ? [`Asked of everyone: ${criteria.join(' · ')}.`] : []),
      `Income is compared with ${possessive(operator)} rule of ${formatRatio(ruleTenths)} times the rent, the same for everyone.`,
    ].join(' '),
  approve: (firstName: string) => `Approve ${firstName}`,
  decline: 'Decline',
  sending: 'Sending…',
  back: 'Back',
  progress: 'Your answers',
  /** UX-PP-2: under the task, while there's still an answer to give. */
  next: (operator: string) =>
    `Nothing is offered until you’ve answered. ${operator} hears as soon as you do.`,
  thanks: {
    title: (firstName: string) => (firstName ? `Thanks, ${firstName}` : 'Thanks'),
    /** The owner comes back to a link they've already answered. */
    again: 'You’ve answered',
    /** What they said, beside each person's name. */
    said: (answer: string | null) => (answer === 'approved' ? 'Approved' : 'Declined'),
    approved: (operator: string, tenant: string) =>
      `${operator} will make the offer to ${tenant} and tell you when there’s an answer.`,
    /** UX-OP-8 (Q42): no reason is asked for. The agent is told at once. */
    declined: (operator: string) => `${operator} will be in touch.`,
  },
  /** States: a send failed. Shown at the button. */
  sendFailed: 'That didn’t send. Check your connection and try again.',
  problem: 'Choose approve or decline.',
} as const;

/**
 * The agent's words for sharing a letting with its owner (UX-OW-1, UX-OW-2, UX-OW-4): in the
 * letting's menu, on its one-screen task, and in the prompt just after the home goes live.
 */
export const shareCopy = {
  menu: 'Share with the owner',
  metaTitle: 'Share with the owner',
  title: 'Share with the owner',
  lead: (address: string) =>
    `They get a private link to follow ${address}: where it stands and what’s been decided. Renters are “Applicant 1” on it, never named.`,
  name: 'Owner’s name',
  email: 'Owner’s email',
  send: 'Send the link',
  sending: 'Sending…',
  shared: {
    title: (name: string) => `Shared with ${name}`,
    opened: (firstName: string, when: string) => `${firstName} last opened it on ${when}.`,
    notOpened: (firstName: string) => `${firstName} hasn’t opened it yet.`,
    again: 'Send a new link',
    stop: 'Stop sharing',
    stopping: 'Stopping…',
    /** What a new link does to the old one. */
    replaces: 'A new link replaces the one they have.',
  },
  sent: {
    title: (firstName: string) => `Sent to ${firstName}`,
    text: (firstName: string, address: string) =>
      `${firstName} can follow ${address} from the link in the email. There’s nothing for them to sign up for.`,
    next: (firstName: string) =>
      `When you’ve chosen a tenant, Gaff asks ${firstName} to approve. You can stop sharing at any time, from this home’s menu.`,
    done: 'Done',
  },
  stopped: {
    title: 'Stopped sharing',
    text: 'The owner’s link no longer works. You can share again at any time.',
    done: 'Done',
  },
  /** UX-OW-1: asked once, just after the home goes live. */
  prompt: {
    title: 'Letting this for an owner?',
    text: 'Let them follow along.',
    button: 'Share with the owner',
  },
  problems: {
    name: 'Enter the owner’s name.',
    email: 'Enter an email address, like name@example.ie.',
    notFound: 'We couldn’t find that letting.',
    ownHome: 'This is your own home, so there’s no owner to share it with.',
  },
  sendFailed: 'That didn’t send. Check your connection and try again.',
} as const;
