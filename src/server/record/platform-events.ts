import { z } from 'zod';
import type { Tx } from '@/db/client';
import { platformEvents } from '@/db/schema';
import { assertNoPersonalData } from '@/domain/record/personal-data';
import type { Actor } from './events';

/**
 * Events outside an organisation (ADR-0017), held to the same rule as the letting record
 * (ADR-0006): IDs, enums, numbers, booleans and dates only. The compliance suite checks it.
 */
export const platformEventCatalogue = {
  /** M3: a code was sent to confirm a mobile, and the mobile was confirmed. */
  'mobile.code_sent': z.object({}),
  'mobile.confirmed': z.object({}),
  /** M1: someone chose to rent with Gaff (their renter profile exists). */
  'renter.profile_created': z.object({ keepDetails: z.boolean() }),
  /** M11, M12: groups of a renter's details copied to a letter with an application (rule 2). */
  'profile.shared': z.object({
    applicationId: z.uuid(),
    groups: z.array(z.enum(['contact', 'answers', 'employment', 'checks'])),
  }),
  /** M9: the renter ticked or unticked "Keep my details for next time". */
  'renter.keep_details': z.object({ keepDetails: z.boolean() }),
  /** M13: a renter deleted their account (who isn't recorded: they're gone). */
  'renter.account_deleted': z.object({}),
  /** M85: a renter saved, or stopped saving, a home. */
  'home.saved': z.object({ listingId: z.uuid() }),
  'home.unsaved': z.object({ listingId: z.uuid() }),
  /** M86: a saved search with alerts, and changes to how often they come. */
  'alert.created': z.object({ frequency: z.enum(['instant', 'daily', 'off']) }),
  'alert.changed': z.object({ frequency: z.enum(['instant', 'daily', 'off']) }),
  /** M96: a report about a listing (who reported it is never logged). */
  'report.received': z.object({
    caseId: z.uuid(),
    reason: z.enum(['scam', 'discrimination', 'misleading', 'already_let', 'offensive', 'other']),
  }),
  /** M98, M106, M107: a decision on a case, by a person or (only to pause) by the rules. */
  'moderation.action': z.object({
    caseId: z.uuid().optional(),
    action: z.enum([
      'pause_listing',
      'restore_listing',
      'remove_listing',
      'pause_account',
      'suspend_account',
      'restore_account',
      'no_action',
    ]),
    automatic: z.boolean(),
  }),
  /** M98: a letter appealed a decision. */
  'moderation.appealed': z.object({ caseId: z.uuid(), appealOf: z.uuid() }),
  /** M105: someone became, or stopped being, Gaff staff (on the test copy, a tester). */
  'staff.added': z.object({ role: z.enum(['reviewer', 'admin']), testCopy: z.boolean() }),
  'staff.removed': z.object({ testCopy: z.boolean() }),
  /** P4: the month's AI spend passed 80% of the budget, and Gaff's admins were told. */
  'ai.budget_warning': z.object({ month: z.iso.date() }),
  /** M86, M87: an alert email went out, with this many homes in it. */
  'alert.sent': z.object({ homes: z.number().int(), frequency: z.enum(['instant', 'daily']) }),
} satisfies Record<string, z.ZodObject>;

export type PlatformEventType = keyof typeof platformEventCatalogue;

export interface NewPlatformEvent<T extends PlatformEventType> {
  type: T;
  actor: Actor;
  subject?: { type: string; id: string };
  data: z.input<(typeof platformEventCatalogue)[T]>;
}

export async function recordPlatformEvent<T extends PlatformEventType>(
  tx: Tx,
  event: NewPlatformEvent<T>,
): Promise<void> {
  const data = platformEventCatalogue[event.type].parse(event.data) as Record<string, unknown>;
  assertNoPersonalData(event.type, data);
  const actorId =
    'userId' in event.actor
      ? event.actor.userId
      : 'applicationId' in event.actor
        ? event.actor.applicationId
        : 'landlordId' in event.actor
          ? event.actor.landlordId
          : null;
  await tx.insert(platformEvents).values({
    actorType: event.actor.type,
    actorId,
    type: event.type,
    subjectType: event.subject?.type ?? null,
    subjectId: event.subject?.id ?? null,
    data,
  });
}
