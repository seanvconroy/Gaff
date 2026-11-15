import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { eventCatalogue } from '@/server/record/events';
import { freeTextFields } from './free-text';

describe('Compliance: the event log holds no personal data (ADR-0006, R27)', () => {
  for (const [type, schema] of Object.entries(eventCatalogue)) {
    it(`"${type}" allows no free-text fields`, () => {
      expect(freeTextFields(schema)).toEqual([]);
    });
  }

  it('the check itself catches a field that could hold a name or a message', () => {
    expect(freeTextFields(z.object({ id: z.uuid(), name: z.string() }))).toEqual(['name']);
    expect(freeTextFields(z.object({ notes: z.array(z.string()).optional() }))).toEqual([
      'notes.[]',
    ]);
    expect(freeTextFields(z.object({ anything: z.record(z.string(), z.unknown()) }))).toEqual([
      'anything (record)',
    ]);
  });
});
