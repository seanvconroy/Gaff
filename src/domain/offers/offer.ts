import { z } from 'zod';
import { formatEuro } from '@/lib/format';
import type { ApprovalAnswer, ApprovalRoute } from './approval';

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
      landlordConfirmed: z.string().optional(),
    })
    .transform((values, ctx) => {
      let depositCents = 0;
      if (!euro.test(values.deposit)) {
        ctx.addIssue({
          code: 'custom',
          path: ['deposit'],
          message: 'Enter the deposit, like 1,850.',
        });
      } else {
        depositCents = Math.round(Number(values.deposit.replace(/[€,\s]/g, '')) * 100);
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
        landlordConfirmed: values.landlordConfirmed === 'yes',
      };
    });
}

export type OfferTerms = z.output<ReturnType<typeof offerTermsSchema>>;

/**
 * Who can be offered the home now (Q20, Q22). The preferred applicant needs the landlord's
 * approval; the backup too, if the operator wants it offered to them automatically.
 */
export function whoCanBeOffered(input: {
  route: ApprovalRoute;
  approval: {
    status: 'requested' | 'answered' | 'withdrawn';
    preferredAnswer: ApprovalAnswer | null;
    backupAnswer: ApprovalAnswer | null;
  } | null;
  landlordConfirmed: boolean;
  hasBackup: boolean;
}): { preferred: boolean; backup: boolean; problem: string | null } {
  if (input.route === 'own_home')
    return { preferred: true, backup: input.hasBackup, problem: null };
  if (input.route === 'operator_confirms') {
    return input.landlordConfirmed
      ? { preferred: true, backup: input.hasBackup, problem: null }
      : { preferred: false, backup: false, problem: 'Confirm that the landlord has approved.' };
  }
  if (!input.approval || input.approval.status !== 'answered') {
    return {
      preferred: false,
      backup: false,
      problem:
        input.approval?.status === 'requested'
          ? 'Wait for the landlord’s answer first.'
          : 'Ask the landlord to approve first.',
    };
  }
  if (input.approval.preferredAnswer !== 'approved') {
    return {
      preferred: false,
      backup: false,
      problem: 'The landlord declined your preferred applicant. Choose again.',
    };
  }
  return {
    preferred: true,
    backup: input.hasBackup && input.approval.backupAnswer === 'approved',
    problem: null,
  };
}

export function offerExpiry(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 3_600_000);
}
