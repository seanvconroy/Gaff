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
