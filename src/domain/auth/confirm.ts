import { z } from 'zod';

/**
 * UX-SI-10: the actions that ask a person to confirm it's them again, whatever the age of their
 * session. Changing where money goes is the fraud that matters most here.
 *
 * - `change_payment_account`: Settings, "Where tenants pay". Built.
 * - `remove_member`: removing someone from an agency. A later package (WP-19) adds it.
 * - `delete_agency`: deleting an agency. A later package adds it.
 */
export const sensitiveActions = [
  'change_payment_account',
  'remove_member',
  'delete_agency',
] as const;
export const sensitiveActionSchema = z.enum(sensitiveActions);
export type SensitiveAction = z.infer<typeof sensitiveActionSchema>;

/** How a person can confirm: a passkey, or a fresh code by email. */
export const confirmMethods = ['passkey', 'email_code'] as const;
export type ConfirmMethod = (typeof confirmMethods)[number];

/** A confirmation is for the action in front of the person: it lasts minutes, and works once. */
export const CONFIRMATION_LASTS_MINUTES = 5;

export function confirmationExpiry(confirmedAt: Date): Date {
  return new Date(confirmedAt.getTime() + CONFIRMATION_LASTS_MINUTES * 60_000);
}

export interface ConfirmationFacts {
  expiresAt: Date;
  usedAt: Date | null;
}

/** Whether a confirmation can still be spent. */
export function confirmationStands(confirmation: ConfirmationFacts, now: Date): boolean {
  return confirmation.usedAt === null && now.getTime() < confirmation.expiresAt.getTime();
}

/**
 * UX-SI-12: how long a private link's sensitive page stays open in one browser after the code
 * sent to the person's email has been entered there.
 */
export const LINK_CODE_LASTS_MINUTES = 30;
