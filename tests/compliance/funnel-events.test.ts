import { describe, expect, it } from 'vitest';
import type { Tx } from '@/db/client';
import {
  directStepCodes,
  funnels,
  recordSources,
  type DirectStepCode,
  type Funnel,
} from '@/domain/funnels/catalogue';
import { eventCatalogue } from '@/server/record/events';
import { funnelStepSchema, recordFunnelStep, type NewFunnelStep } from '@/server/funnels/steps';
import { freeTextFields } from './free-text';

const SUBJECT = '0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11';

const REACHED = 'a refused funnel step reached the database';

/** A stand-in transaction: a step that gets as far as the database fails with REACHED. */
const noDatabase = {
  insert() {
    throw new Error(REACHED);
  },
} as unknown as Tx;

const attempt = (step: Record<string, unknown>) =>
  recordFunnelStep(noDatabase, step as unknown as NewFunnelStep).then(
    () => null,
    (error: Error) => error,
  );

/** The step is turned away by the checks, before anything is written. */
async function expectRefused(step: Record<string, unknown>): Promise<void> {
  const error = await attempt(step);
  expect(error, JSON.stringify(step)).toBeInstanceOf(Error);
  expect(error!.message, JSON.stringify(step)).not.toContain(REACHED);
}

describe('Compliance: funnel events hold no personal data (UX-ME-1, rule 8, ADR-0006)', () => {
  it('UX-ME-1: a funnel event’s schema allows no free-text field', () => {
    expect(freeTextFields(funnelStepSchema)).toEqual([]);
  });

  it('UX-ME-1: a step with an ID, a code and a count is let through to be written', async () => {
    const error = await attempt({
      step: 'import.review_confirmed',
      subjectId: SUBJECT,
      variant: 'import',
      data: { fieldsChanged: 2 },
    });
    expect(error?.message).toBe(REACHED);
  });

  it.each([
    ['a name', 'Ann Power'],
    ['an email address', 'ann@example.ie'],
    ['a phone number', '+353 87 123 4567'],
    ['free text', 'I have two kids and a dog'],
  ])(
    'UX-ME-1: %s is refused as the subject, the split, the step or in the payload',
    async (_l, value) => {
      const step: DirectStepCode = 'sign_in.method_chosen';
      await expectRefused({ step, subjectId: value });
      await expectRefused({ step, subjectId: SUBJECT, variant: value });
      await expectRefused({ step: value, subjectId: SUBJECT });
      await expectRefused({ step, subjectId: SUBJECT, data: { fieldsChanged: value } });
      await expectRefused({ step, subjectId: SUBJECT, data: { note: value } });
      await expectRefused({ step, subjectId: SUBJECT, name: value });
    },
  );

  it('UX-ME-4: there is nowhere to put an IP address, a user agent or a location', async () => {
    const step: DirectStepCode = 'renter_questions.page_opened';
    for (const extra of [
      { ipAddress: '203.0.113.7' },
      { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
      { location: 'Ranelagh' },
      { data: { ipAddress: '203.0.113.7' } },
      { data: { scrolled: 80 } },
    ]) {
      await expectRefused({ step, subjectId: SUBJECT, ...extra });
    }
  });

  it('UX-ME-1: only the catalogue’s own steps can be written as funnel events', async () => {
    // A step the record already holds is mapped from its event, never written a second time.
    await expectRefused({ step: 'add_letting.live', subjectId: SUBJECT });
    await expectRefused({ step: 'made_up.step', subjectId: SUBJECT });
    expect(directStepCodes.length).toBeGreaterThan(10);
  });

  it('UX-ME-1: every mapped step reads an event, and fields, that the record really has', () => {
    const catalogue = eventCatalogue as Record<string, { shape: Record<string, unknown> }>;
    for (const { step, source } of recordSources()) {
      const schema = catalogue[source.event];
      expect(schema, `${step} reads "${source.event}"`).toBeDefined();
      const fields = Object.keys(schema!.shape);
      for (const key of Object.keys(source.where ?? {})) {
        expect(fields, `${step} filters "${source.event}" by ${key}`).toContain(key);
      }
      if (typeof source.subject === 'object') {
        expect(fields, `${step} counts "${source.event}" by ${source.subject.data}`).toContain(
          source.subject.data,
        );
      }
      if (source.variant) {
        expect(fields, `${step} splits "${source.event}" by ${source.variant}`).toContain(
          source.variant,
        );
      }
    }
  });

  it('UX-ME-1: a mapped step counts by an ID or a code, never a free-text field', () => {
    for (const { step, source } of recordSources()) {
      const schema = eventCatalogue[source.event as keyof typeof eventCatalogue];
      // The whole event is already free of free text (event-payloads.test.ts); this pins the
      // fields the funnels read.
      expect(freeTextFields(schema), step).toEqual([]);
    }
  });

  it('UX-ME-2: every step has somewhere its number comes from', () => {
    const catalogue: readonly Funnel[] = funnels;
    for (const funnel of catalogue) {
      for (const step of funnel.steps) {
        expect(step.sources.length, `${funnel.code}.${step.code}`).toBeGreaterThan(0);
      }
    }
  });
});
