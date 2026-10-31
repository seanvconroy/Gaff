import type { z } from 'zod';

/** What a form's server action returns to the page: field errors and the values to refill. */
export interface FormState {
  errors?: Record<string, string>;
  values?: Record<string, string>;
  message?: string;
  /**
   * Changes on every response. Forms use it as their React key, so after React resets a
   * submitted form it remounts with what the person typed (selects included).
   */
  attempt?: number;
}

let attempts = 0;

/** A failed submission: the errors to show and the values to put back. */
export function invalid(
  errors: Record<string, string>,
  values: Record<string, string>,
  message?: string,
): FormState {
  attempts += 1;
  return {
    errors,
    values,
    attempt: Date.now() * 1000 + (attempts % 1000),
    ...(message ? { message } : {}),
  };
}

export const emptyFormState: FormState = {};

/** Reads a submitted form as plain strings; checkbox groups become comma-separated. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('$ACTION') || typeof value !== 'string') continue;
    values[key] = key in values ? `${values[key]},${value}` : value;
  }
  return values;
}

/** The first error message for each field, keyed by the field's name ("a.b" for nested). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}
