import { type LettingCounts, navCounts } from '@/domain/navigation/counts';
import type { Member } from '@/server/auth/member';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import type { CurrentPerson } from './current-person';

/** UX-NV-5: the figures for the badges on Today and Inbox, from what the dashboard already counts. */
export async function lettingCountsFor(member: Member): Promise<LettingCounts> {
  const { today } = await dashboardForRequest(member);
  return navCounts(today);
}

/**
 * UX-NV-21: Enquiries carries a count when something needs the renter. A signed-in renter has no
 * enquiries of their own yet (work packages WP-12 and WP-14 build them), so today nothing can
 * need them. The bar already shows whatever this returns.
 */
export async function rentingCountsFor(_person: CurrentPerson): Promise<{ enquiries: number }> {
  return { enquiries: 0 };
}
