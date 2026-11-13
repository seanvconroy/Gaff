import { env } from '@/lib/env';
import type { PasswordBreachCheck } from '@/ports/password-breach';
import { pwnedPasswords } from './pwned-passwords';
import { standInBreachCheck } from './stand-in';

const off: PasswordBreachCheck = { isBreached: async () => false };

export function passwordBreachCheck(): PasswordBreachCheck {
  switch (env().PASSWORD_BREACH_CHECK) {
    case 'pwned_passwords':
      return pwnedPasswords();
    case 'stand_in':
      return standInBreachCheck;
    case 'off':
      return off;
  }
}
