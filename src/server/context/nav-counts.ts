import { type LettingCounts, navCounts } from '@/domain/navigation/counts';
import type { Member } from '@/server/auth/member';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import { enquiriesNeedingThem } from '@/server/renter/enquiries';
import type { CurrentPerson } from './current-person';

/** UX-NV-5: the figures for the badges on Today and Inbox, from what the dashboard already counts. */
export async function lettingCountsFor(member: Member): Promise<LettingCounts> {
  const { today } = await dashboardForRequest(member);
  return navCounts(today);
}

/**
 * UX-NV-21, UX-RH-1: Enquiries carries a count when something needs the renter: the homes in
 * their own Enquiries with a button waiting for them (src/domain/renter/enquiries.ts).
 */
export async function rentingCountsFor(person: CurrentPerson): Promise<{ enquiries: number }> {
  return { enquiries: await enquiriesNeedingThem(person.userId) };
}
