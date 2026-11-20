import { z } from 'zod';

/**
 * Q43: a number renters can call, for anyone who'd rather ring than use Gaff. It is the lister's
 * own number: an agency's office, or a private landlord's. It is shown as it was typed, tidied,
 * and is never put in an event, a log or a web address (a landlord's number is personal data).
 */
const ALLOWED = /^\+?[\d\s()-]+$/;

/** "  01  234 5678 " → "01 234 5678"; null if it isn't a phone number. */
export function tidyPhone(input: string): string | null {
  const tidy = input.trim().replace(/\s+/g, ' ');
  const digits = tidy.replace(/\D/g, '').length;
  return ALLOWED.test(tidy) && digits >= 7 && digits <= 15 ? tidy : null;
}

/** A form's phone field. Blank is "none given": it is offered, never required (UX-LT-14). */
export const phoneFieldSchema = z
  .preprocess((value) => (value === undefined || value === null ? '' : value), z.string())
  .transform((value, ctx) => {
    if (!value.trim()) return undefined;
    const phone = tidyPhone(value);
    if (!phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a phone number, like 01 234 5678, or leave it blank',
      });
      return z.NEVER;
    }
    return phone;
  });
