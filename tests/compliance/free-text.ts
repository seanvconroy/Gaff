import type { z } from 'zod';

/**
 * ADR-0006: event payloads hold only IDs, enums, numbers, booleans and dates. A plain string
 * field could carry a name or a message, so no event's schema may contain one. This walks a
 * schema and names every field that could hold free text, or that it doesn't know to be safe.
 */
const SAFE_STRING_FORMATS = new Set(['uuid', 'date', 'datetime']);

export function freeTextFields(schema: z.ZodType, path: string[] = []): string[] {
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
    case 'date':
      return [];
    default:
      return [`${path.join('.')} (${def.type})`];
  }
}
