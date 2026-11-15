import { lt } from 'drizzle-orm';
import { z } from 'zod';
import { db, type Tx } from '@/db/client';
import { funnelEvents } from '@/db/schema';
import {
  directStepCodes,
  funnelOfDirectStep,
  type DirectStepCode,
} from '@/domain/funnels/catalogue';
import {
  funnelDataSchema,
  funnelSubjectSchema,
  funnelVariantSchema,
  type FunnelData,
  type FunnelVariant,
} from '@/domain/funnels/steps';
import { assertNoPersonalData } from '@/domain/record/personal-data';

/**
 * UX-ME-1: everything a funnel event holds. The step is a code from the catalogue, the subject
 * an ID, the split a code, the payload named counts. A compliance test rejects any plain string
 * here, as it does for the record's events (ADR-0006).
 */
export const funnelStepSchema = z.strictObject({
  step: z.enum(directStepCodes),
  subjectId: funnelSubjectSchema,
  variant: funnelVariantSchema.optional(),
  data: funnelDataSchema.optional(),
  occurredAt: z.date().optional(),
});

export interface NewFunnelStep {
  step: DirectStepCode;
  /** The ID of what's counted: see the funnel's subject in the catalogue. */
  subjectId: string;
  variant?: FunnelVariant;
  data?: FunnelData;
  occurredAt?: Date;
}

/**
 * Records that a subject reached a funnel step, in the caller's transaction, so the step and the
 * change it measures are saved together. A step counts once per subject: recording it again
 * changes nothing. Only for steps the letting's record has no event for (see the catalogue).
 */
export async function recordFunnelStep(tx: Tx, input: NewFunnelStep): Promise<void> {
  const step = funnelStepSchema.parse(input);
  const data = step.data ?? {};
  assertNoPersonalData(step.step, {
    subjectId: step.subjectId,
    variant: step.variant ?? null,
    data,
  });
  await tx
    .insert(funnelEvents)
    .values({
      step: step.step,
      subjectType: funnelOfDirectStep(step.step).subject,
      subjectId: step.subjectId,
      variant: step.variant ?? null,
      data,
      ...(step.occurredAt ? { occurredAt: step.occurredAt } : {}),
    })
    // Once per subject: the unique index on (step, subject) turns a repeat into nothing. No
    // conflict target is named, because naming one would need the right to read the table,
    // which only the system path has.
    .onConflictDoNothing();
}

/**
 * For a step that is only a screen being opened: there's no change to save it with, so it gets
 * its own short transaction. Measuring never gets in a person's way: if it fails, the page still
 * loads, and the log names the step and nothing else.
 */
export async function noteFunnelStep(input: NewFunnelStep): Promise<void> {
  try {
    await db().transaction((tx) => recordFunnelStep(tx, input));
  } catch (error) {
    console.error(
      `Funnel step "${String(input.step)}" was not recorded:`,
      error instanceof Error ? error.name : 'unknown error',
    );
  }
}

/**
 * Rule 9: funnel events are kept as long as the rest of the anonymous record (events and
 * decisions), then deleted by the retention job. Returns how many went.
 */
export async function purgeFunnelEvents(tx: Tx, before: Date): Promise<number> {
  const gone = await tx
    .delete(funnelEvents)
    .where(lt(funnelEvents.occurredAt, before))
    .returning({ id: funnelEvents.id });
  return gone.length;
}
