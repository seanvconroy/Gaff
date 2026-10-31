/**
 * A problem the person can fix, in plain words, optionally tied to a form field.
 * Server actions show these; anything else is an unexpected error.
 */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}
