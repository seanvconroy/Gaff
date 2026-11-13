import type { PasswordBreachCheck } from '@/ports/password-breach';

/** A few passwords everyone knows, so development and tests can see the refusal. */
export const STAND_IN_BREACHED = [
  'password1234',
  'qwertyuiop12',
  '123456789012',
  'correct horse battery staple',
];

/** Development and tests: refuses a short fixed list, and asks nobody. */
export const standInBreachCheck: PasswordBreachCheck = {
  async isBreached(password) {
    return STAND_IN_BREACHED.includes(password.toLowerCase());
  },
};
