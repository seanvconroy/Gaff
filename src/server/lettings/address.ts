import { eq } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { homes } from '@/db/schema';
import { addressForRenter } from '@/domain/listings/projection';

/**
 * M38: the address a renter sees at their stage, for a letting whose home may show only the
 * street. Read inside the caller's transaction.
 */
export async function renterAddress(
  tx: Tx,
  letting: { homeId: string; addressLine1: string },
  status: string,
): Promise<string> {
  const [home] = await tx
    .select({ showExactAddress: homes.showExactAddress })
    .from(homes)
    .where(eq(homes.id, letting.homeId));
  return addressForRenter(letting.addressLine1, home?.showExactAddress ?? true, status);
}
