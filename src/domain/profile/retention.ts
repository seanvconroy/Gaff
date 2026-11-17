import { irishToday } from '@/lib/format';

/**
 * UX-PF-7 (rule 9, Q25): a renter's profile is kept while they use it. One that has gone unused
 * for two years is deleted by the nightly retention job, never by hand, and the person is told
 * by email 30 days before, so they can keep it by signing in.
 *
 * "Used" is anything the person does with their own profile: opening Enquiries or Profile,
 * opening one of their homes' pages while signed in, keeping or confirming their details. Each
 * moves the date on and withdraws a notice already sent.
 *
 * This is the renter's own copy. An application to a letting is the operator's copy, and follows
 * the letting's retention (src/domain/retention/retention.ts).
 */
export const PROFILE_UNUSED_YEARS = 2;
export const PROFILE_NOTICE_DAYS = 30;

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Irish date a profile last used at this moment is deleted: two years on, to the day. */
export function profileDeletionDate(lastUsedAt: Date): string {
  const [y, m, d] = irishToday(lastUsedAt).split('-').map(Number) as [number, number, number];
  // 29 February has no day two years on: the day after is used.
  return new Date(Date.UTC(y + PROFILE_UNUSED_YEARS, m - 1, d)).toISOString().slice(0, 10);
}

/** The Irish date the notice is due: 30 days before the profile would be deleted. */
export function profileNoticeDate(lastUsedAt: Date): string {
  return addDays(profileDeletionDate(lastUsedAt), -PROFILE_NOTICE_DAYS);
}

/**
 * The date the notice gives. Normally two years after the profile was last used. If the notice
 * went late (the job missed some nights), it is 30 days after the notice instead: nobody's
 * profile is deleted on less than 30 days' notice.
 */
export function deletionDateAfterNotice(lastUsedAt: Date, noticeSentAt: Date): string {
  const twoYears = profileDeletionDate(lastUsedAt);
  const afterNotice = addDays(irishToday(noticeSentAt), PROFILE_NOTICE_DAYS);
  return afterNotice > twoYears ? afterNotice : twoYears;
}

export type ProfileRetention = 'keep' | 'send_notice' | 'delete';

/** What the retention job does with one profile tonight. */
export function profileRetention(
  profile: { lastUsedAt: Date; noticeSentAt: Date | null },
  now: Date,
): ProfileRetention {
  const today = irishToday(now);
  if (today < profileNoticeDate(profile.lastUsedAt)) return 'keep';
  if (profile.noticeSentAt === null) return 'send_notice';
  return today >= deletionDateAfterNotice(profile.lastUsedAt, profile.noticeSentAt)
    ? 'delete'
    : 'keep';
}

/** A profile's use is noted once a day at most: the date matters, not the minute. */
export function useIsWorthNoting(
  profile: { lastUsedAt: Date; noticeSentAt: Date | null },
  now: Date,
): boolean {
  return profile.noticeSentAt !== null || irishToday(profile.lastUsedAt) !== irishToday(now);
}

/**
 * UX-PF-6: what "Delete my profile" removes. Everything a renter keeps goes at once, always. The
 * sign-in itself goes too, unless the person also lets homes on Gaff: their work for an agency,
 * or their own lettings, needs it, and is not theirs alone to delete here.
 */
export function deletionRemoves(person: { organisations: number }): {
  kept: true;
  enquiries: true;
  account: boolean;
} {
  return { kept: true, enquiries: true, account: person.organisations === 0 };
}
