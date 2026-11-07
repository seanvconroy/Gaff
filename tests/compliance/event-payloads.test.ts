import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { eventCatalogue } from '@/server/record/events';
import { platformEventCatalogue } from '@/server/record/platform-events';

/**
 * ADR-0006: event payloads hold only IDs, enums, numbers, booleans and dates. A plain
 * string field could carry a name or a message, so the catalogue may not contain one.
 */
const SAFE_STRING_FORMATS = new Set(['uuid', 'date', 'datetime']);

function freeTextFields(schema: z.ZodType, path: string[] = []): string[] {
  const def = (schema as unknown as { _zod: { def: Record<string, unknown> & { type: string } } })
    ._zod.def;
  switch (def.type) {
    case 'object':
      return Object.entries(def.shape as Record<string, z.ZodType>).flatMap(([key, value]) =>
        freeTextFields(value, [...path, key]),
      );
    case 'array':
      return freeTextFields(def.element as z.ZodType, [...path, '[]']);
    case 'optional':
    case 'nullable':
    case 'default':
      return freeTextFields(def.innerType as z.ZodType, path);
    case 'string':
      return SAFE_STRING_FORMATS.has(def.format as string) ? [] : [path.join('.')];
    case 'enum':
    case 'literal':
    case 'number':
    case 'boolean':
      return [];
    default:
      return [`${path.join('.')} (${def.type})`];
  }
}

describe('Compliance: the event log holds no personal data (ADR-0006, R27)', () => {
  for (const [type, schema] of Object.entries(eventCatalogue)) {
    it(`"${type}" allows no free-text fields`, () => {
      expect(freeTextFields(schema)).toEqual([]);
    });
  }
});

describe('Compliance: platform events hold no personal data either (ADR-0006, ADR-0017)', () => {
  for (const [type, schema] of Object.entries(platformEventCatalogue)) {
    it(`"${type}" allows no free-text fields`, () => {
      expect(freeTextFields(schema)).toEqual([]);
    });
  }
});
