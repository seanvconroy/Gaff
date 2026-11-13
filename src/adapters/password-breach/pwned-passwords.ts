import { createHash } from 'node:crypto';
import type { PasswordBreachCheck } from '@/ports/password-breach';

/**
 * Have I Been Pwned's Pwned Passwords, by k-anonymity: Gaff sends the first 5 characters of the
 * password's SHA-1 hash and gets back every breached hash that starts with them, about 800 on
 * average, then looks for the rest of the hash itself. The service never sees the password, its
 * hash, or who's asking for whom; "Add-Padding" hides even how many hashes matched.
 *
 * If the service is slow or down, the password is let through: a sign-up never waits on it.
 */
export function pwnedPasswords(
  fetcher: typeof fetch = fetch,
  timeoutMs = 2_000,
): PasswordBreachCheck {
  return {
    async isBreached(password) {
      const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      try {
        const response = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { 'Add-Padding': 'true', 'User-Agent': 'Gaff' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const lines = (await response.text()).split(/\r?\n/);
        // Each line is "<35 hex characters>:<times seen>". Padding lines have a count of 0.
        return lines.some((line) => {
          const [candidate, count] = line.trim().split(':');
          return candidate?.toUpperCase() === suffix && Number(count) > 0;
        });
      } catch (error) {
        console.warn(
          'Breached-password check unavailable; letting the password through:',
          (error as Error).name,
        );
        return false;
      }
    },
  };
}
