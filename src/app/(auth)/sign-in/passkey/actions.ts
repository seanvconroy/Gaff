'use server';

import { cookies } from 'next/headers';
import { passkeyMemoryFrom } from '@/domain/auth/passkey-offer';
import { cookieLifetimes, cookieNames, cookieOptions } from '@/server/auth/cookies';
import { currentUser } from '@/server/auth/member';

/**
 * UX-SI-4: remembers, on this device, what the person said to the passkey offer. "Not now" is
 * kept for 30 days; a device that has a passkey isn't asked again.
 */
export async function rememberPasskeyAnswer(answer: 'later' | 'added'): Promise<void> {
  const memory = passkeyMemoryFrom(answer);
  if (!memory || !(await currentUser())) return;
  (await cookies()).set(
    cookieNames.passkey,
    memory,
    cookieOptions(memory === 'added' ? cookieLifetimes.passkeyAdded : cookieLifetimes.passkeyLater),
  );
}
