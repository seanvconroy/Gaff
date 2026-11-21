import { lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/db/client';
import { profileEvents } from '@/db/schema';
import { keptParts } from '@/domain/profile/kept';
import { assertNoPersonalData } from '@/domain/record/personal-data';

/**
 * Rule 8, for a person's own profile: every step is logged, in the transaction that made the
 * change, and the log holds no personal data. A profile belongs to no organisation, so its steps
 * can't go in a letting's record (ADR-0006); they go in `profile_events`, which only the person's
 * own path and the system can read.
 *
 * Every type and the shape of its payload is here. Payload fields are IDs, codes, yes/no values
 * and dates: the compliance test rejects a plain string, and `assertNoPersonalData` is the second
 * line of defence. A detail itself (a number, an answer, an income) is never in the log: only
 * which part changed.
 */
export const profileEventCatalogue = {
  /**
   * UX-PF-2, UX-RN-13: details were kept on the profile. `from` is where they were entered: the
   * tick on an application's check screen, an application, the questions, a booking.
   */
  'profile.details_kept': z.object({
    from: z.enum(['tick', 'application', 'answers', 'booking']),
    applicationId: z.uuid(),
    mobile: z.boolean(),
    answers: z.boolean(),
    income: z.boolean(),
  }),
  /** Profile: a part was changed there, or taken off. Which part: never what it holds. */
  'profile.details_changed': z.object({ part: z.enum(keptParts) }),
  'profile.details_removed': z.object({ part: z.enum(keptParts) }),
  /** UX-PF-2: keeping what they enter was switched on or off. */
  'profile.keeping_set': z.object({ on: z.boolean() }),
  /** UX-RH-4: an enquiry was added to their Enquiries. */
  'profile.enquiry_added': z.object({ applicationId: z.uuid() }),
  /**
   * UX-PF-3: kept details were offered back on a home's page and the person sent them on.
   * Nothing reaches an operator without this step.
   */
  'profile.details_confirmed': z.object({
    applicationId: z.uuid(),
    part: z.enum(['answers', 'income']),
  }),
  /**
   * Saved (WP-23): a home was saved with the heart, or taken off. Which home is the person's
   * own business: the record says only that it happened.
   */
  'profile.home_saved': z.object({}),
  'profile.home_removed': z.object({}),
  /** UX-SR-10: a search was saved on the profile, or removed from it. */
  'profile.search_saved': z.object({ savedSearchId: z.uuid() }),
  'profile.search_removed': z.object({ savedSearchId: z.uuid() }),
  /** UX-SR-10: the alerts of their saved searches were switched on or off ("Stop these" too). */
  'profile.search_alerts_set': z.object({ on: z.boolean(), from: z.enum(['profile', 'email']) }),
  /** M86: a saved search now hears as soon as a home is listed, or once a day. */
  'profile.search_frequency_set': z.object({
    savedSearchId: z.uuid(),
    frequency: z.enum(['instant', 'daily']),
  }),
  /**
   * UX-PF-8, UX-TS-2: an ID check that passed was kept on the profile: one they chose to keep
   * after a letting's check (`check`), a private landlord's at their go-live (`go_live`), or one
   * done again because their name changed (`name_changed`). Never the name or the date.
   */
  'profile.identity_kept': z.object({ from: z.enum(['check', 'go_live', 'name_changed']) }),
  /**
   * UX-PF-12: the renter said yes to using the ID check they keep, for this application's
   * checks. This is the one step by which it reaches an operator.
   */
  'profile.identity_used': z.object({ applicationId: z.uuid() }),
  /** UX-PF-9, UX-TS-2: they started an ID check of their own; how it ended (codes only). */
  'profile.identity_check_started': z.object({
    identityCheckId: z.uuid(),
    purpose: z.enum(['go_live', 'name_changed']),
    /** P25: which try, of three. */
    attempt: z.number().int().optional(),
  }),
  /** P26: the ID provider deleted the document and selfie it held for this check. */
  'profile.identity_check_redacted': z.object({ identityCheckId: z.uuid() }),
  'profile.identity_check_ended': z.object({
    identityCheckId: z.uuid(),
    outcome: z.enum(['passed', 'not_passed']),
  }),
  /** "Download my details". */
  'profile.downloaded': z.object({}),
  /**
   * BA-8 (AU6, AU7, AU11): a way in was added to or taken off the person's account: Google or
   * Apple connected or disconnected, a passkey added or removed. Which kind: never its name.
   */
  'profile.sign_in_added': z.object({ method: z.enum(['google', 'apple', 'passkey', 'mobile']) }),
  'profile.sign_in_removed': z.object({
    method: z.enum(['google', 'apple', 'passkey', 'mobile']),
  }),
  /** AU6: one of their passkeys was renamed. The name itself is theirs, and isn't here. */
  'profile.passkey_renamed': z.object({}),
  /** AU8: they signed other devices out: one, or all the others. */
  'profile.signed_out_elsewhere': z.object({ sessions: z.number().int().min(1) }),
  /** UX-PF-7: the email that says the profile will be deleted, and on which date. */
  'profile.deletion_notice_sent': z.object({ deleteOn: z.iso.date() }),
  /**
   * UX-PF-6, UX-PF-7: the profile was deleted: by the person, at once, or by the retention job
   * after two years unused. `account` says whether the sign-in went too. This is the one line
   * that outlives the profile, so "deleted on schedule" can be read from the record.
   */
  'profile.deleted': z.object({ by: z.enum(['person', 'retention']), account: z.boolean() }),
} as const;

export type ProfileEventType = keyof typeof profileEventCatalogue;
type ProfileEventData<T extends ProfileEventType> = z.input<(typeof profileEventCatalogue)[T]>;

/** Writes a profile's event in the caller's transaction, which is the person's own or the system's. */
export async function recordProfileEvent<T extends ProfileEventType>(
  tx: Tx,
  userId: string,
  type: T,
  data: ProfileEventData<T>,
  occurredAt?: Date,
): Promise<void> {
  const parsed = profileEventCatalogue[type].parse(data) as Record<string, unknown>;
  assertNoPersonalData(type, parsed);
  await tx
    .insert(profileEvents)
    .values({ userId, type, data: parsed, ...(occurredAt ? { occurredAt } : {}) });
}

/** Rule 9: the profile record is kept as long as the rest of the anonymous record, then deleted. */
export async function purgeProfileEvents(tx: Tx, before: Date): Promise<number> {
  const gone = await tx
    .delete(profileEvents)
    .where(lt(profileEvents.occurredAt, before))
    .returning({ id: profileEvents.id });
  return gone.length;
}
