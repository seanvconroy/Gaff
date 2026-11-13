/**
 * AU1: what a password must be. Length is what matters, so there are no rules about mixing
 * letters, numbers and symbols, and anything can be typed or pasted, spaces and emoji included.
 * Passwords seen in data breaches are refused by a separate check (src/ports/password-breach).
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type PasswordProblem = 'too_short' | 'too_long' | 'is_email' | 'breached';

export const passwordMessages: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN} characters. A short sentence works well.`,
  too_long: `Keep your password to ${PASSWORD_MAX} characters or fewer.`,
  is_email: 'Your password can’t be your email address. Choose something else.',
  breached: 'This password has appeared in a data breach, so it isn’t safe to use. Choose another.',
};

/** The first thing wrong with a new password, or null. Breaches are checked afterwards. */
export function passwordProblem(
  password: string,
  email: string,
): Exclude<PasswordProblem, 'breached'> | null {
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return 'is_email';
  if (password.length < PASSWORD_MIN) return 'too_short';
  if (password.length > PASSWORD_MAX) return 'too_long';
  return null;
}
