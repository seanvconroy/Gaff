/**
 * Port for checking whether a password has appeared in a data breach (AU12, ADR-0028).
 * Adapters: Have I Been Pwned's Pwned Passwords, a stand-in for development and tests, and off.
 */
export interface PasswordBreachCheck {
  /** True only when the password is known to be breached. Never throws. */
  isBreached(password: string): Promise<boolean>;
}
