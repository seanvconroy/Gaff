/**
 * Rule 8: personal data never goes into logs. Most of Gaff's own log lines are written without
 * any, but a library's aren't ours to write: the sign-in library names the email address on
 * some lines. Everything it logs goes through here first.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** A sign-in token, a state value, a key: anything unbroken and this long isn't a word. */
const TOKEN = /\b[A-Za-z0-9_-]{24,}\b/g;
/** A 6-digit code. */
const CODE = /\b\d{6}\b/g;

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unreadable]';
  }
}

export function redactForLog(value: unknown): string {
  return asText(value).replace(EMAIL, '[email]').replace(TOKEN, '[token]').replace(CODE, '[code]');
}
