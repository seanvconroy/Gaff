import { z } from 'zod';
import { COMPARABLES_NEEDED } from '@/domain/rent/comparables';
import { formatEuro } from '@/lib/format';
import { checksStillUnderWay, type ApprovalAnswer, type ApprovalRoute } from './approval';

/**
 * R20, stage 7: the offer goes to the chosen renter with a deadline to accept. The only money
 * it mentions is the deposit and the first month's rent, each capped at one month's rent, paid
 * to the landlord's or agent's own account, never through Gaff (rules 4 and 5).
 */
export const deadlineChoices = [24, 48, 72] as const;

const euro = /^€?\s*(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;

export function offerTermsSchema(rentCents: number, today: string) {
  return z
    .object({
      deposit: z.string().trim(),
      startDate: z.string().trim(),
      deadlineHours: z.string().trim(),
      offerBackup: z.string().optional(),
      /** UX-DC-19: the person goes ahead before every check is back. */
      withoutChecks: z.string().optional(),
    })
    .transform((values, ctx) => {
      const typed = parseEuro(values.deposit);
      const depositCents = typed ?? 0;
      if (typed === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['deposit'],
          message: 'Enter the deposit, like 1,850.',
        });
      } else {
        if (depositCents > rentCents) {
          ctx.addIssue({
            code: 'custom',
            path: ['deposit'],
            message: `The deposit can’t be more than one month’s rent: ${formatEuro(rentCents)}.`,
          });
        }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startDate) || values.startDate < today) {
        ctx.addIssue({
          code: 'custom',
          path: ['startDate'],
          message: 'Choose a move-in date from today on.',
        });
      }
      const hours = Number(values.deadlineHours);
      if (!(deadlineChoices as readonly number[]).includes(hours)) {
        ctx.addIssue({
          code: 'custom',
          path: ['deadlineHours'],
          message: 'Choose how long they have to answer.',
        });
      }
      return {
        depositCents,
        startDate: values.startDate,
        deadlineHours: hours,
        offerBackup: values.offerBackup === 'yes',
        withoutChecks: values.withoutChecks === 'yes',
      };
    });
}

export type OfferTerms = z.output<ReturnType<typeof offerTermsSchema>>;

/** Where the owner's approval stands, as the offer needs it (R19, Q22). */
export interface ApprovalStanding {
  status: 'requested' | 'answered' | 'withdrawn';
  preferredAnswer: ApprovalAnswer | null;
  backupAnswer: ApprovalAnswer | null;
}

/**
 * Who can be offered the home now (Q20, Q22). The preferred applicant needs the owner's
 * approval; the backup too, if the operator wants it offered to them automatically. The owner
 * answers by link, or the operator records that the owner has already approved (UX-DC-15): either
 * way it is an answered approval. A landlord letting their own home approves by making the offer.
 */
export function whoCanBeOffered(input: {
  route: ApprovalRoute;
  approval: ApprovalStanding | null;
  hasBackup: boolean;
}): { preferred: boolean; backup: boolean; problem: string | null } {
  if (input.route === 'own_home')
    return { preferred: true, backup: input.hasBackup, problem: null };
  if (!input.approval || input.approval.status !== 'answered') {
    return {
      preferred: false,
      backup: false,
      problem:
        input.approval?.status === 'requested'
          ? 'Wait for the owner’s answer first.'
          : 'Ask the owner to approve first.',
    };
  }
  if (input.approval.preferredAnswer !== 'approved') {
    return {
      preferred: false,
      backup: false,
      problem: 'The owner declined your preferred applicant. Choose again.',
    };
  }
  return {
    preferred: true,
    backup: input.hasBackup && input.approval.backupAnswer === 'approved',
    problem: null,
  };
}

/** UX-DC-19: something the offer waits for, said at its place on the offer's first screen. */
export type OfferBlocker =
  | { code: 'owner'; standing: 'ask' | 'waiting' | 'declined' }
  | { code: 'comparables'; recorded: number }
  | { code: 'checks'; waiting: number };

/**
 * UX-DC-19 (R4, R19): the offer can't go until the owner has approved (agencies), three
 * comparable rents are recorded, and the preferred applicant's checks are back, or the person
 * says they're going ahead without them. Each thing missing is named, so the screen can link to
 * it. An empty list means the offer can be sent.
 */
export function offerBlockers(input: {
  route: ApprovalRoute;
  approval: ApprovalStanding | null;
  hasBackup: boolean;
  comparables: number;
  /** The preferred applicant's checks. */
  checks: ReadonlyArray<{ status: string }>;
  withoutChecks: boolean;
}): OfferBlocker[] {
  const blockers: OfferBlocker[] = [];
  if (!whoCanBeOffered(input).preferred) {
    blockers.push({
      code: 'owner',
      standing:
        input.approval?.status === 'answered'
          ? 'declined'
          : input.approval?.status === 'requested'
            ? 'waiting'
            : 'ask',
    });
  }
  if (input.comparables < COMPARABLES_NEEDED) {
    blockers.push({ code: 'comparables', recorded: input.comparables });
  }
  const waiting = checksStillUnderWay(input.checks);
  if (waiting > 0 && !input.withoutChecks) blockers.push({ code: 'checks', waiting });
  return blockers;
}

/**
 * UX-DC-18 (rule 4): an amount as someone types it, "€1,850", "1850" or "1,850.00", in cents.
 * Null for anything that isn't an amount.
 */
export function parseEuro(typed: string): number | null {
  const value = typed.trim();
  if (!euro.test(value)) return null;
  return Math.round(Number(value.replace(/[€,\s]/g, '')) * 100);
}

export function offerExpiry(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 3_600_000);
}
