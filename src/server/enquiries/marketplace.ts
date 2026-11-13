import { and, count, desc, eq, gte, ne, or } from 'drizzle-orm';
import { withEnquiry, withPublic, withRenter, type Tx } from '@/db/client';
import {
  applications,
  lettings,
  listings,
  messages,
  profileShares,
  publicListings,
  renterEnquiries,
  renterProfiles,
} from '@/db/schema';
import { questionsFor } from '@/domain/criteria/criteria';
import {
  canWithdraw,
  enquiryLimitReached,
  fairUseProblem,
  readEnquiry,
} from '@/domain/enquiries/marketplace';
import { normaliseEmail, normalisePhone } from '@/domain/enquiries/parse';
import type { ProjectionLetter } from '@/domain/listings/projection';
import { groupsSharedAt } from '@/domain/profiles/sharing';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import { needsAnswers, queueDraft } from '@/server/answers/draft';
import { loadListing } from '@/server/listings/context';
import { moveListing } from '@/server/listings/publish';
import { recordEvent } from '@/server/record/events';
import { recordPlatformEvent } from '@/server/record/platform-events';
import { cancelBookingIn } from '@/server/viewings/booking';
import { queueFirstReply } from './first-reply';
import { newApplicationRef } from './process';

/**
 * M76 to M82: a signed-in renter enquires about a live listing on Gaff. In one transaction
 * (withEnquiry), the application is created or merged (M78), what was shared is recorded in the
 * renter's own zone (M11, M12), and the workflow starts at stage 2 with the first reply (M77).
 */

export interface Renter {
  userId: string;
  email: string;
}

export type EnquiryResult =
  | { ok: true; applicationId: string }
  | { ok: false; errors: Record<string, string> }
  | { ok: false; refused: string };

const NOT_TAKING = 'This home isn’t taking enquiries now.';
const LIMIT_REACHED =
  'This home has had as many enquiries as the letter set, so enquiries are now closed.';

/** M9: the wording a renter agrees to when they tick "Keep my details for next time". */
export const KEEP_DETAILS_VERSION = 'm9-v1';

async function enquiriesToday(userId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 86_400_000);
  const [row] = await withRenter(userId, (tx) =>
    tx.select({ n: count() }).from(renterEnquiries).where(gte(renterEnquiries.enquiredAt, since)),
  );
  return row?.n ?? 0;
}

export async function enquireAboutListing(
  renter: Renter,
  slug: string,
  values: Record<string, string>,
  now = new Date(),
): Promise<EnquiryResult> {
  const [listing] = await withPublic((tx) =>
    tx
      .select({
        listingId: publicListings.listingId,
        organisationId: publicListings.organisationId,
        status: publicListings.status,
        title: publicListings.title,
        addressShown: publicListings.addressShown,
        slug: publicListings.slug,
        letter: publicListings.letter,
      })
      .from(publicListings)
      .where(eq(publicListings.slug, slug)),
  );
  if (!listing || listing.status !== 'live') return { ok: false, refused: NOT_TAKING };
  const tooMany = fairUseProblem(await enquiriesToday(renter.userId, now));
  if (tooMany) return { ok: false, refused: tooMany };

  return withEnquiry(listing.organisationId, renter.userId, async (tx) => {
    const [owned] = await tx
      .select({ lettingId: listings.lettingId })
      .from(listings)
      .where(eq(listings.id, listing.listingId));
    if (!owned) return { ok: false, refused: NOT_TAKING };
    const [letting] = await tx
      .select()
      .from(lettings)
      .where(eq(lettings.id, owned.lettingId))
      .for('update');
    const context = await loadListing(tx, owned.lettingId);
    if (!letting || !context || letting.status !== 'live' || context.listing.status !== 'live') {
      return { ok: false, refused: NOT_TAKING };
    }
    const criteria = letting.criteria ?? { noPets: false };
    const read = readEnquiry(values, criteria, now);
    if (!read.ok) return { ok: false, errors: read.errors };
    const enquiry = read.enquiry;
    const asked = questionsFor(criteria).length > 0;

    // M78: one application per renter per letting, merged with a Daft or MyHome enquiry.
    const emailNormalised = normaliseEmail(renter.email);
    const phoneE164 = normalisePhone(enquiry.mobile);
    const [existing] = await tx
      .select({
        id: applications.id,
        sources: applications.sources,
        status: applications.status,
        deletedAt: applications.personalDataDeletedAt,
      })
      .from(applications)
      .where(
        and(
          eq(applications.lettingId, letting.id),
          or(
            eq(applications.emailNormalised, emailNormalised),
            eq(applications.renterUserId, renter.userId),
          ),
        ),
      )
      .for('update');
    if (existing?.deletedAt) return { ok: false, refused: NOT_TAKING };

    let applicationId: string;
    if (existing) {
      applicationId = existing.id;
      const canChange = existing.status === 'enquired';
      await tx
        .update(applications)
        .set({
          renterUserId: renter.userId,
          lastEnquiredAt: now,
          sources: [...new Set([...existing.sources, 'gaff'])],
          ...(enquiry.mobile ? { phone: enquiry.mobile, phoneE164 } : {}),
          ...(canChange && asked ? { answers: enquiry.answers, answersAt: now } : {}),
        })
        .where(eq(applications.id, existing.id));
    } else {
      // M52: the limit counts everyone who enquired, through any portal, and is checked under
      // the letting's lock, so two renters can't both take the last place.
      const [{ n }] = (await tx
        .select({ n: count() })
        .from(applications)
        .where(
          and(eq(applications.lettingId, letting.id), ne(applications.status, 'withdrawn')),
        )) as [{ n: number }];
      if (enquiryLimitReached(n, letting.enquiryLimit)) {
        await moveListing(tx, context, 'enquiries_closed', 'enquiry_limit', null, now);
        return { ok: false, refused: LIMIT_REACHED };
      }
      const [created] = await tx
        .insert(applications)
        .values({
          organisationId: listing.organisationId,
          lettingId: letting.id,
          ref: newApplicationRef(),
          fullName: enquiry.fullName,
          email: renter.email,
          emailNormalised,
          phone: enquiry.mobile,
          phoneE164,
          sources: ['gaff'],
          firstEnquiredAt: now,
          lastEnquiredAt: now,
          renterUserId: renter.userId,
          answers: asked ? enquiry.answers : null,
          answersAt: asked ? now : null,
        })
        .returning({ id: applications.id });
      applicationId = created!.id;
    }

    const [message] = await tx
      .insert(messages)
      .values({
        organisationId: listing.organisationId,
        lettingId: letting.id,
        applicationId,
        direction: 'inbound',
        channel: 'app',
        kind: 'enquiry',
        author: 'renter',
        subject: `Enquiry on Gaff about ${listing.title}`,
        body: enquiry.message,
        status: 'received',
      })
      .returning({ id: messages.id });

    // The renter's own record: "My homes" (M79) and "Who has my details" (M12).
    const letter = listing.letter as unknown as ProjectionLetter;
    await tx
      .insert(renterEnquiries)
      .values({
        applicationId,
        userId: renter.userId,
        organisationId: listing.organisationId,
        lettingId: letting.id,
        listingId: listing.listingId,
        title: listing.title,
        addressShown: listing.addressShown,
        slug: listing.slug,
        letterName: letter.name,
        enquiredAt: now,
      })
      .onConflictDoUpdate({
        target: renterEnquiries.applicationId,
        set: { enquiredAt: now, withdrawnAt: null },
      });
    const groups = groupsSharedAt('enquiry').filter((g) => g !== 'answers' || asked);
    await tx
      .insert(profileShares)
      .values(
        groups.map((dataGroup) => ({
          userId: renter.userId,
          organisationId: listing.organisationId,
          applicationId,
          dataGroup,
        })),
      )
      .onConflictDoNothing();
    await recordPlatformEvent(tx, {
      type: 'profile.shared',
      actor: { type: 'person', userId: renter.userId },
      data: { applicationId, groups: [...groups] },
    });
    await keepOrForgetDetails(tx, renter.userId, enquiry, now);

    await recordEvent(tx, {
      organisationId: listing.organisationId,
      lettingId: letting.id,
      actor: { type: 'renter', applicationId },
      type: existing ? 'enquiry.repeated' : 'enquiry.received',
      subject: { type: 'application', id: applicationId },
      data: { applicationId, portal: 'gaff' },
    });
    // M77: the workflow starts at stage 2: the first reply, and answers to any questions (R8).
    if (!existing) await queueFirstReply(tx, listing.organisationId, applicationId);
    if (needsAnswers(enquiry.message)) await queueDraft(tx, listing.organisationId, message!.id);

    if (!existing && letting.enquiryLimit !== null) {
      const [{ n }] = (await tx
        .select({ n: count() })
        .from(applications)
        .where(
          and(eq(applications.lettingId, letting.id), ne(applications.status, 'withdrawn')),
        )) as [{ n: number }];
      if (enquiryLimitReached(n, letting.enquiryLimit)) {
        await moveListing(tx, context, 'enquiries_closed', 'enquiry_limit', null, now);
      }
    }
    return { ok: true, applicationId };
  });
}

/**
 * M8, M9 (Q25): with "Keep my details" ticked, the renter's mobile and answers are kept in their
 * profile for next time; unticked, anything kept before is forgotten. Their details still go
 * to this letter with the enquiry either way.
 */
async function keepOrForgetDetails(
  tx: Tx,
  userId: string,
  enquiry: { fullName: string; mobile: string | null; keepDetails: boolean; answers: object },
  now: Date,
): Promise<void> {
  const [profile] = await tx.select().from(renterProfiles).where(eq(renterProfiles.userId, userId));
  const givenName = enquiry.fullName.split(/\s+/)[0]!;
  const familyName = enquiry.fullName.split(/\s+/).slice(1).join(' ') || null;
  const kept = enquiry.keepDetails
    ? {
        keepDetails: true,
        keepConsentAt: profile?.keepDetails ? profile.keepConsentAt : now,
        keepConsentVersion: KEEP_DETAILS_VERSION,
        familyName,
        mobile: enquiry.mobile,
        answers: { ...(profile?.answers ?? {}), ...enquiry.answers },
      }
    : { keepDetails: false, familyName: null, mobile: null, answers: null };
  if (!profile) {
    await tx.insert(renterProfiles).values({ userId, givenName, lastUsedAt: now, ...kept });
  } else {
    await tx
      .update(renterProfiles)
      .set({ givenName: profile.givenName || givenName, lastUsedAt: now, ...kept })
      .where(eq(renterProfiles.userId, userId));
  }
  if (!profile || profile.keepDetails !== enquiry.keepDetails) {
    await recordPlatformEvent(tx, {
      type: 'renter.keep_details',
      actor: { type: 'person', userId },
      data: { keepDetails: enquiry.keepDetails },
    });
  }
}

/** M81: the renter withdraws their enquiry; the letter sees it, and retention follows. */
export async function withdrawEnquiry(
  renter: Renter,
  applicationId: string,
  now = new Date(),
): Promise<'withdrawn' | 'too_late' | 'not_found'> {
  const [mine] = await withRenter(renter.userId, (tx) =>
    tx
      .select({ organisationId: renterEnquiries.organisationId })
      .from(renterEnquiries)
      .where(eq(renterEnquiries.applicationId, applicationId)),
  );
  if (!mine) return 'not_found';
  return withEnquiry(mine.organisationId, renter.userId, async (tx) => {
    const [application] = await tx
      .select({
        id: applications.id,
        lettingId: applications.lettingId,
        status: applications.status,
        deleteAfter: applications.deleteAfter,
      })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.renterUserId, renter.userId)))
      .for('update');
    if (!application) return 'not_found';
    if (!canWithdraw(application.status)) return 'too_late';
    if (application.status === 'booked') {
      await cancelBookingIn(tx, mine.organisationId, application.id);
    }
    const deleteAfter = irishToday(
      new Date(now.getTime() + env().RETENTION_PERSONAL_DAYS * 86_400_000),
    );
    await tx
      .update(applications)
      .set({
        status: 'withdrawn',
        waitlistPosition: null,
        deleteAfter:
          application.deleteAfter && application.deleteAfter < deleteAfter
            ? application.deleteAfter
            : deleteAfter,
      })
      .where(eq(applications.id, application.id));
    await tx
      .update(renterEnquiries)
      .set({ withdrawnAt: now })
      .where(eq(renterEnquiries.applicationId, application.id));
    await recordEvent(tx, {
      organisationId: mine.organisationId,
      lettingId: application.lettingId,
      actor: { type: 'renter', applicationId: application.id },
      type: 'enquiry.withdrawn',
      subject: { type: 'application', id: application.id },
      data: { applicationId: application.id, from: application.status },
    });
    return 'withdrawn';
  });
}

/** M60, M79: has this renter enquired about this listing? (For "You enquired".) */
export async function enquiredAbout(userId: string, listingId: string) {
  const [row] = await withRenter(userId, (tx) =>
    tx
      .select({
        applicationId: renterEnquiries.applicationId,
        enquiredAt: renterEnquiries.enquiredAt,
        withdrawnAt: renterEnquiries.withdrawnAt,
      })
      .from(renterEnquiries)
      .where(eq(renterEnquiries.listingId, listingId))
      .orderBy(desc(renterEnquiries.enquiredAt))
      .limit(1),
  );
  return row ?? null;
}
