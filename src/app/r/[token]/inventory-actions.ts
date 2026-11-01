'use server';

import { redirect } from 'next/navigation';
import { confirmInventory } from '@/server/tenancy/movein';

/** R25: the tenant confirms the inventory is a fair record. */
export async function confirmInventoryAction(token: string): Promise<void> {
  await confirmInventory(token);
  redirect(`/r/${token}?inventory=confirmed`);
}
