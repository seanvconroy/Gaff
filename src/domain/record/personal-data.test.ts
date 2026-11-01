import { describe, expect, it } from 'vitest';
import { assertNoPersonalData, isSafeEventValue } from './personal-data';

describe('ADR-0006: event payloads hold no personal data', () => {
  it.each([
    ['a UUID', '0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11'],
    ['a date', '2026-11-04'],
    ['a date-time', '2026-11-04T09:12:00.000Z'],
    ['a code', 'move_in_date'],
    ['a dotted code', 'criteria.not_met'],
    ['a number', 4],
    ['a boolean', true],
    ['null', null],
    ['a list of codes', ['pets', 'max_occupants']],
    ['a nested object of safe values', { met: 3, of: 4, reasons: ['pets'] }],
    ['a document fingerprint (SHA-256)', '0'.repeat(8) + 'a1b2c3d4'.repeat(7)],
  ])('allows %s', (_label, value) => {
    expect(isSafeEventValue(value)).toBe(true);
  });

  it.each([
    ['a full name', 'Ann Power'],
    ['a capitalised first name', 'Seán'],
    ['an email address', 'ann@example.ie'],
    ['an Irish mobile number', '+353 87 123 4567'],
    ['a phone number without spaces', '0871234567'],
    ['a long number that isn’t a fingerprint', '0871234567'.repeat(6)],
    ['an address', '12 Ranelagh Road'],
    ['free text', 'I have two kids and a dog'],
    ['an Eircode', 'D06 F2X3'],
    ['a name inside a list', ['pets', 'Ann Power']],
    ['a name inside an object', { reason: 'Ann Power' }],
    ['a key that is free text', { 'Ann Power': 1 }],
  ])('rejects %s', (_label, value) => {
    expect(isSafeEventValue(value)).toBe(false);
  });

  it('names the event type when it refuses a payload', () => {
    expect(() => assertNoPersonalData('letting.created', { name: 'Ann Power' })).toThrow(
      /letting.created/,
    );
  });
});
