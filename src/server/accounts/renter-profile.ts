import { eq } from 'drizzle-orm';
import { type Tx, withPerson } from '@/db/client';
import { renterProfiles } from '@/db/schema';
import { readAnswersForm, readIncomeForm, readMobileForm } from '@/domain/profile/forms';
import {
  type DetailsToKeep,
  type KeptDetails,
  type KeptPart,
  mergeKept,
  NOTHING_KEPT,
  withoutPart,
} from '@/domain/profile/kept';
import { useIsWorthNoting } from '@/domain/profile/retention';
import { irishToday } from '@/lib/format';
import { recordFunnelStep } from '@/server/funnels/steps';
import { oneAtATime } from './contexts';
import { recordProfileEvent } from './profile-events';
import { profileIn, saveProfileIn } from './profile';

/**
 * What a renter keeps for next time (UX-PF-1 to UX-PF-5, Q25). Like the rest of a person's own
 * profile it is read and written only here, inside `withPerson()` for the signed-in person
 * themselves: no organisation's path can reach it (UX-AC-5, ADR-0016).
 *
 * What may be kept, and what is kept from an application, are rules in
 * `src/domain/profile/kept.ts`. Each change writes its event in the same transaction (rule 8).
 */
export interface RenterProfile extends KeptDetails {
  /** Whether they keep anything yet: someone who has never needed this has no row. */
  exists: boolean;
  /** UX-PF-2: what they enter in an enquiry or an application is kept, until they switch it off. */
  keepsDetails: boolean;
  lastUsedAt: Date | null;
  deletionNoticeSentAt: Date | null;
  /** UX-SR-10: whether their saved searches email them when a new home fits. */
  searchAlerts: boolean;
}

const EMPTY: RenterProfile = {
  ...NOTHING_KEPT,
  exists: false,
  keepsDetails: true,
  lastUsedAt: null,
  deletionNoticeSentAt: null,
  searchAlerts: true,
};

/** Reads what a renter keeps, in a transaction that is already scoped to this person. */
export async function renterProfileIn(tx: Tx, userId: string): Promise<RenterProfile> {
  const [row] = await tx.select().from(renterProfiles).where(eq(renterProfiles.userId, userId));
  if (!row) return EMPTY;
  return {
    exists: true,
    keepsDetails: row.keepsDetails,
    mobile: row.mobile,
    answers: row.answers,
    answersAt: row.answersAt,
    earning: row.earning,
    monthlyIncomeCents: row.monthlyIncomeCents,
    incomeAt: row.incomeAt,
    lastUsedAt: row.lastUsedAt,
    deletionNoticeSentAt: row.deletionNoticeSentAt,
    searchAlerts: row.searchAlerts,
  };
}

/** What the signed-in person keeps. Pass their own ID and nobody else's. */
export function readRenterProfile(userId: string): Promise<RenterProfile> {
  return withPerson(userId, (tx) => renterProfileIn(tx, userId));
}

/**
 * Makes "Renting" one of the person's contexts, and starts their renter's profile, in a
 * transaction already scoped to them. Someone who keeps their details, or whose enquiry is added
 * to Enquiries, is renting: nobody asks them (UX-AC-6). Safe to call again.
 */
export async function ensureRenterIn(tx: Tx, userId: string, now = new Date()): Promise<void> {
  const profile = await profileIn(tx, userId);
  if (profile.rentingSince === null) {
    await saveProfileIn(tx, userId, {
      rentingSince: now,
      // Someone with nothing open yet opens on the renting side; anyone else stays where they are.
      ...(profile.lastSide === null ? { lastSide: 'renting' } : {}),
    });
    await recordFunnelStep(tx, {
      step: 'first_run.set_up_finished',
      subjectId: userId,
      variant: 'renter',
    });
  }
  await tx.insert(renterProfiles).values({ userId, lastUsedAt: now }).onConflictDoNothing();
}

async function writeKept(tx: Tx, userId: string, kept: KeptDetails, now: Date): Promise<void> {
  await tx
    .update(renterProfiles)
    .set({
      mobile: kept.mobile,
      answers: kept.answers,
      answersAt: kept.answersAt,
      earning: kept.earning,
      monthlyIncomeCents: kept.monthlyIncomeCents,
      incomeAt: kept.incomeAt,
      // Keeping or changing something is using the profile (UX-PF-7).
      lastUsedAt: now,
      deletionNoticeSentAt: null,
    })
    .where(eq(renterProfiles.userId, userId));
}

/**
 * UX-PF-2, UX-RN-13: keeps what a renter entered on one of their own applications. Returns
 * whether anything was kept.
 *
 * - `tick`: they ticked "Keep my details for next time". That is their choice to keep, so it
 *   starts their profile and switches keeping on.
 * - Otherwise it is someone who already has a profile, and it is kept only while keeping is on.
 *
 * The caller has already shown that the application is this person's own (`enquiryIsTheirs`).
 */
export async function keepEntered(
  userId: string,
  entered: DetailsToKeep,
  source: { from: 'tick' | 'application' | 'answers' | 'booking'; applicationId: string },
  now = new Date(),
): Promise<boolean> {
  return withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    await ensureRenterIn(tx, userId, now);
    const profile = await renterProfileIn(tx, userId);
    if (source.from === 'tick') {
      await tx
        .update(renterProfiles)
        .set({ keepsDetails: true })
        .where(eq(renterProfiles.userId, userId));
    } else if (!profile.keepsDetails) return false;
    const parts = {
      mobile: entered.mobile !== undefined,
      answers: entered.answers !== undefined,
      income: entered.income !== undefined,
    };
    if (!parts.mobile && !parts.answers && !parts.income) return source.from === 'tick';
    await writeKept(tx, userId, mergeKept(profile, entered), now);
    await recordProfileEvent(tx, userId, 'profile.details_kept', {
      from: source.from,
      applicationId: source.applicationId,
      ...parts,
    });
    return true;
  });
}

export type ChangeResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * Profile: changes one part of what is kept, from its own form. The values are read by the rules
 * in `src/domain/profile/forms.ts`; nothing else can be written. Income is kept with today as the
 * date they said it (UX-PF-5).
 */
export async function changeKeptPart(
  userId: string,
  part: KeptPart,
  values: Readonly<Record<string, string | undefined>>,
  now = new Date(),
): Promise<ChangeResult> {
  const entered: DetailsToKeep = {};
  if (part === 'mobile') {
    const read = readMobileForm(values);
    if (!read.ok) return read;
    entered.mobile = read.value;
  } else if (part === 'answers') {
    const read = readAnswersForm(values, irishToday(now));
    if (!read.ok) return read;
    entered.answers = { values: read.value, at: now };
  } else {
    const read = readIncomeForm(values);
    if (!read.ok) return read;
    entered.income = { ...read.value, at: now };
  }
  await withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    await ensureRenterIn(tx, userId, now);
    const profile = await renterProfileIn(tx, userId);
    // The answers form is the whole row: a question left blank is no longer kept.
    const from = part === 'answers' ? withoutPart(profile, 'answers') : profile;
    await writeKept(tx, userId, mergeKept(from, entered), now);
    await recordProfileEvent(tx, userId, 'profile.details_changed', { part });
  });
  return { ok: true };
}

/** Profile: takes one part off the profile, at once. */
export async function removeKeptPart(
  userId: string,
  part: KeptPart,
  now = new Date(),
): Promise<void> {
  await withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    const profile = await renterProfileIn(tx, userId);
    if (!profile.exists) return;
    await writeKept(tx, userId, withoutPart(profile, part), now);
    await recordProfileEvent(tx, userId, 'profile.details_removed', { part });
  });
}

/** UX-PF-2: switches keeping what they enter on or off. What is already kept stays until removed. */
export async function setKeeping(userId: string, on: boolean, now = new Date()): Promise<void> {
  await withPerson(userId, async (tx) => {
    await oneAtATime(tx, userId);
    await ensureRenterIn(tx, userId, now);
    const profile = await renterProfileIn(tx, userId);
    if (profile.keepsDetails === on) return;
    await tx
      .update(renterProfiles)
      .set({ keepsDetails: on, lastUsedAt: now, deletionNoticeSentAt: null })
      .where(eq(renterProfiles.userId, userId));
    await recordProfileEvent(tx, userId, 'profile.keeping_set', { on });
  });
}

/**
 * UX-PF-3: kept details were offered back on a home's page, and the person sent them on. The
 * record shows that nothing reached an operator without their own press of the button.
 */
export async function noteConfirmed(
  userId: string,
  applicationId: string,
  part: 'answers' | 'income',
): Promise<void> {
  await withPerson(userId, (tx) =>
    recordProfileEvent(tx, userId, 'profile.details_confirmed', { applicationId, part }),
  );
}

/**
 * UX-PF-7: notes that a renter used their profile, which moves its two-year date on and
 * withdraws a notice already sent. Once a day is enough. Someone who isn't renting has no
 * renter's profile, and gets none from this.
 */
export async function noteProfileUse(userId: string, now = new Date()): Promise<void> {
  await withPerson(userId, async (tx) => {
    const profile = await renterProfileIn(tx, userId);
    if (!profile.exists) {
      if ((await profileIn(tx, userId)).rentingSince === null) return;
      await tx.insert(renterProfiles).values({ userId, lastUsedAt: now }).onConflictDoNothing();
      return;
    }
    if (
      !useIsWorthNoting(
        { lastUsedAt: profile.lastUsedAt ?? now, noticeSentAt: profile.deletionNoticeSentAt },
        now,
      )
    ) {
      return;
    }
    await tx
      .update(renterProfiles)
      .set({ lastUsedAt: now, deletionNoticeSentAt: null })
      .where(eq(renterProfiles.userId, userId));
  });
}
