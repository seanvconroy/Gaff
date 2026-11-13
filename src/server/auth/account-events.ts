import { db } from '@/db/client';
import {
  type NewPlatformEvent,
  type PlatformEventType,
  recordPlatformEvent,
} from '@/server/record/platform-events';

type AccountEventType = Extract<PlatformEventType, `account.${string}`>;

/**
 * AU16: the record of signing in, in the platform's event log (ADR-0017): which way, never
 * who beyond the account's ID, and nothing personal (ADR-0006).
 *
 * Most of these are written from the sign-in library's hooks, straight after its own write, so
 * they aren't in the same transaction as the change (ADR-0028 records why). They measure how
 * sign-in is going; they aren't the letting record. A failure to write one is logged and never
 * stops anyone signing in.
 */
export async function recordAccountEvent<T extends AccountEventType>(
  type: T,
  userId: string | null,
  data: NewPlatformEvent<T>['data'],
): Promise<void> {
  try {
    await db().transaction((tx) =>
      recordPlatformEvent(tx, {
        type,
        actor: userId ? { type: 'person', userId } : { type: 'system' },
        ...(userId ? { subject: { type: 'user', id: userId } } : {}),
        data,
      } as NewPlatformEvent<T>),
    );
  } catch (error) {
    console.error(`Sign-in event "${type}" was not recorded`, (error as Error).name);
  }
}
