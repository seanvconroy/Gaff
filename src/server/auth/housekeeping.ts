import { lt } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { sessions, verifications } from '@/db/schema';

/**
 * AU14 (rule 9): sign-in's leftovers, deleted by the nightly retention job, not by hand. A
 * session holds the network address and browser of a device, so one that has ended goes. So do
 * Better Auth's verifications once they've run out: the state of a half-finished Google or Apple
 * sign-in, and passkey challenges. Codes, confirmations and the limiter's counters have their
 * own clean-up (./codes, ./confirm, ./limits).
 */
export async function purgeEndedSignIns(
  tx: Tx,
  now: Date,
): Promise<{ sessions: number; verifications: number }> {
  const endedSessions = await tx
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  const ranOut = await tx
    .delete(verifications)
    .where(lt(verifications.expiresAt, now))
    .returning({ id: verifications.id });
  return { sessions: endedSessions.length, verifications: ranOut.length };
}
