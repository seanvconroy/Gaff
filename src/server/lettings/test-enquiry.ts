import { asc, count, eq } from 'drizzle-orm';
import { firstReply } from '@/copy/templates/first-reply';
import { type Tx, withOrg } from '@/db/client';
import { applications, lettings, organisations, viewingSlots } from '@/db/schema';
import { questionsFor } from '@/domain/criteria/criteria';
import { TEST_RENTER } from '@/domain/enquiries/forwarding';
import { canSendTestEnquiry } from '@/domain/lettings/setup';
import { env } from '@/lib/env';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { assertMayActOn } from '@/server/team/permissions';

/** The made-up renter a test enquiry comes from. Not a person, and never stored. */
export { TEST_RENTER };

/** How many people have enquired about a letting: a test enquiry is offered until one has. */
export async function enquiryCount(member: Member, lettingId: string): Promise<number> {
  return withOrg(member.organisationId, async (tx) => {
    const [row] = await tx
      .select({ n: count() })
      .from(applications)
      .where(eq(applications.lettingId, lettingId));
    return row?.n ?? 0;
  });
}

export interface TestEnquiry {
  /** The first reply, exactly as a renter would get it: the same fixed template (R7). */
  subject: string;
  body: string;
  /** Whether the reply asks the renter the questions the letting details need (R9). */
  asksQuestions: boolean;
}

/**
 * UX-LT-24: "Send a test enquiry". It shows the lister what a renter gets: the first reply Gaff
 * would send to a made-up enquiry about this home, written by the same fixed template as the
 * real one. Nothing is sent to anyone, no renter is made, and no link in it opens: the record
 * notes only that the person looked.
 *
 * The forwarding flow sends its test through the person's own rule instead, and shows this same
 * reply at the end of it (UX-LT-19, `src/server/enquiries/forwarding.ts`).
 */
export async function sendTestEnquiry(member: Member, lettingId: string): Promise<TestEnquiry> {
  return withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const [letting] = await tx.select().from(lettings).where(eq(lettings.id, lettingId));
    if (!letting) throw new UserFacingError('We couldn’t find that letting.');
    const [enquired] = await tx
      .select({ n: count() })
      .from(applications)
      .where(eq(applications.lettingId, lettingId));
    if (!canSendTestEnquiry({ status: letting.status, enquiries: enquired?.n ?? 0 })) {
      throw new UserFacingError(
        letting.status === 'live'
          ? 'Real enquiries have arrived for this home, so there’s no need for a test.'
          : 'A test enquiry can be sent once the home is live.',
      );
    }
    const reply = await firstReplyToTest(tx, member.organisationId, letting);
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.test_enquiry_sent',
      data: {},
    });
    return reply;
  });
}

/**
 * The first reply Gaff would send a made-up renter about this home, by the same fixed template as
 * a real one (R7). Nothing is sent: it is shown to the person who asked for the test.
 */
export async function firstReplyToTest(
  tx: Tx,
  organisationId: string,
  letting: typeof lettings.$inferSelect,
): Promise<TestEnquiry> {
  const [organisation] = await tx
    .select({ name: organisations.name, inboundSlug: organisations.inboundSlug })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
  const [firstSlot] = await tx
    .select({ startsAt: viewingSlots.startsAt })
    .from(viewingSlots)
    .where(eq(viewingSlots.lettingId, letting.id))
    .orderBy(asc(viewingSlots.startsAt))
    .limit(1);
  const appUrl = env().APP_URL;
  const asksQuestions = questionsFor(letting.criteria ?? { noPets: false }).length > 0;
  const { subject, body } = firstReply({
    renterName: TEST_RENTER,
    operatorName: organisation!.name,
    address: letting.addressLine1,
    area: letting.area,
    rentCents: letting.monthlyRentCents,
    availableFrom: letting.availableFrom,
    // A real reply carries the renter's own private link here. A test has no renter.
    questionsUrl: asksQuestions ? `${appUrl}/r/a-private-link` : null,
    firstViewing: firstSlot?.startsAt ?? null,
    privacyUrl: `${appUrl}/privacy/${organisation!.inboundSlug}`,
  });
  return { subject, body, asksQuestions };
}
