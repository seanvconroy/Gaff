/**
 * ADR-0006: event payloads hold only IDs, codes, counts and dates — never names, contact
 * details or free text — so the event log can stay append-only while personal data is
 * deleted on schedule. This is the second line of defence after each event's schema.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** A SHA-256 fingerprint of a document (R22): it identifies text, not a person. */
const SHA256 = /^[0-9a-f]{64}$/;
/** Machine codes: lowercase, starting with a letter, no spaces, no @, no +. */
const CODE = /^[a-z][a-z0-9_.:-]{0,63}$/;

export function isSafeEventValue(value: unknown): boolean {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return true;
  if (typeof value === 'string') {
    return (
      UUID.test(value) ||
      ISO_DATE.test(value) ||
      ISO_DATE_TIME.test(value) ||
      SHA256.test(value) ||
      CODE.test(value)
    );
  }
  if (Array.isArray(value)) return value.every(isSafeEventValue);
  if (typeof value === 'object') {
    return Object.entries(value).every(([key]) => CODE.test(key) || /^[a-z][a-zA-Z0-9]*$/.test(key))
      ? Object.values(value).every(isSafeEventValue)
      : false;
  }
  return false;
}

export class PersonalDataInEventError extends Error {
  constructor(type: string) {
    super(
      `Event "${type}" has a value that could be personal data. Event payloads may hold only IDs, codes, numbers and dates (ADR-0006).`,
    );
  }
}

export function assertNoPersonalData(type: string, data: Record<string, unknown>): void {
  if (!isSafeEventValue(data)) throw new PersonalDataInEventError(type);
}
