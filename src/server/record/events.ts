import { z } from 'zod';
import type { Tx } from '@/db/client';
import { events } from '@/db/schema';
import { assertNoPersonalData } from '@/domain/record/personal-data';

/**
 * Every event type and the shape of its payload (ADR-0006). Payload fields must be IDs,
 * enums, numbers, booleans or dates: a compliance test rejects plain strings here.
 */
export const eventCatalogue = {
  'organisation.created': z.object({ kind: z.enum(['agency', 'landlord']) }),
  'member.joined': z.object({ role: z.enum(['admin', 'negotiator']) }),
  'letting.created': z.object({ setupFacts: z.number().int().min(0), withLandlord: z.boolean() }),
  'viewings.session_added': z.object({
    sessionId: z.uuid(),
    kind: z.enum(['slots', 'group']),
    slots: z.number().int().min(1),
    places: z.number().int().min(1),
  }),
  'viewings.session_removed': z.object({ sessionId: z.uuid() }),
  'rent_check.recorded': z.object({
    result: z.enum(['market', 'capped', 'get_advice']),
    reason: z.enum([
      'first_letting',
      'tenant_ended',
      'tenancy_before_new_rules',
      'landlord_ended',
      'substantial_change',
    ]),
    rulesVersion: z.enum(['ie-2026-03-v1']),
    lastLet: z.enum(['never', 'before_new_rules', 'under_new_rules']),
    ending: z.enum(['tenant_left', 'tenant_breach', 'unsuitable', 'landlord_other']).optional(),
    previousRentCents: z.number().int().optional(),
    previousRentSetOn: z.iso.date().optional(),
  }),
  'letting.rent_changed': z.object({ fromCents: z.number().int(), toCents: z.number().int() }),
  /** The full criteria are kept, so the record shows what everyone was ranked against. */
  'criteria.set': z.object({
    moveInBy: z.iso.date().optional(),
    minStayMonths: z.number().int().optional(),
    maxOccupants: z.number().int().optional(),
    noPets: z.boolean(),
  }),
} satisfies Record<string, z.ZodObject>;

export type EventType = keyof typeof eventCatalogue;
export type EventData<T extends EventType> = z.input<(typeof eventCatalogue)[T]>;

export type Actor =
  | { type: 'person'; userId: string }
  | { type: 'ai' }
  | { type: 'system' }
  | { type: 'renter'; applicationId: string }
  | { type: 'landlord'; landlordId: string };

function actorId(actor: Actor): string | null {
  switch (actor.type) {
    case 'person':
      return actor.userId;
    case 'renter':
      return actor.applicationId;
    case 'landlord':
      return actor.landlordId;
    default:
      return null;
  }
}

export interface NewEvent<T extends EventType> {
  organisationId: string;
  lettingId?: string | null;
  actor: Actor;
  type: T;
  subject?: { type: string; id: string };
  data: EventData<T>;
  occurredAt?: Date;
}

/** Writes an event in the caller's transaction, so the record never drifts from the data. */
export async function recordEvent<T extends EventType>(tx: Tx, event: NewEvent<T>): Promise<void> {
  const data = eventCatalogue[event.type].parse(event.data) as Record<string, unknown>;
  assertNoPersonalData(event.type, data);
  await tx.insert(events).values({
    organisationId: event.organisationId,
    lettingId: event.lettingId ?? null,
    actorType: event.actor.type,
    actorId: actorId(event.actor),
    type: event.type,
    subjectType: event.subject?.type ?? null,
    subjectId: event.subject?.id ?? null,
    data,
    ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
  });
}
