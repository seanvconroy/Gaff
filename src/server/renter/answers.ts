import { and, asc, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import {
  applications,
  lettings,
  organisations,
  tenancies,
  viewingSlots,
  waitlistOffers,
} from '@/db/schema';
import { renterAnswersSchema, type RenterAnswers } from '@/domain/criteria/answers';
import { questionsFor } from '@/domain/criteria/criteria';
import { bookableSlots } from '@/domain/viewings/booking';
import { resolveAccessLink } from '@/server/access/links';
import { recordEvent } from '@/server/record/events';
import { checksOf } from '@/server/checks/checks';
import { offerOf } from '@/server/offers/offer';
import { inventoryOf } from '@/server/tenancy/movein';
import { currentBooking, slotAvailability } from '@/server/viewings/booking';
import { renterAddress } from '@/server/lettings/address';

/** R9: what a renter's private link shows: their application, the home and the questions. */
export async function loadRenterPage(token: string) {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  return withOrg(link.organisationId, async (tx) => {
    const [row] = await tx
      .select({ application: applications, letting: lettings, organisation: organisations })
      .from(applications)
      .innerJoin(lettings, eq(lettings.id, applications.lettingId))
      .innerJoin(organisations, eq(organisations.id, applications.organisationId))
      .where(eq(applications.id, link.subjectId));
    if (!row || row.application.personalDataDeletedAt) return null;
    const [firstSlot] = await tx
      .select({ startsAt: viewingSlots.startsAt })
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, row.letting.id))
      .orderBy(asc(viewingSlots.startsAt))
      .limit(1);
    const criteria = row.letting.criteria ?? { noPets: false };
    const allSlots = await slotAvailability(tx, row.letting.id, row.application.id);
    const booking = await currentBooking(tx, row.application.id);
    const offers = await tx
      .select()
      .from(waitlistOffers)
      .where(
        and(
          eq(waitlistOffers.applicationId, row.application.id),
          eq(waitlistOffers.status, 'open'),
        ),
      );
    // Someone on the waiting list sees only a place they've been offered that's still free
    // to book (R14).
    const bookable = bookableSlots(allSlots, new Date());
    const offer = offers.find((o) => bookable.some((slot) => slot.id === o.slotId)) ?? null;
    const slots =
      row.application.status === 'waitlisted'
        ? allSlots.filter((slot) => slot.id === offer?.slotId)
        : allSlots;
    const checks = ['preferred', 'backup'].includes(row.application.status)
      ? await checksOf(tx, row.application.id)
      : [];
    const homeOffer = ['offered', 'accepted', 'declined'].includes(row.application.status)
      ? await offerOf(tx, row.application.id)
      : null;
    const [tenancy] =
      row.application.status === 'accepted'
        ? await tx.select().from(tenancies).where(eq(tenancies.applicationId, row.application.id))
        : [];
    // R23: the operator's account, shown only here, and only once payment has been asked for.
    const payTo =
      tenancy?.paymentRequestedAt && row.organisation.paymentIban
        ? {
            accountName: row.organisation.paymentAccountName ?? '',
            iban: row.organisation.paymentIban,
          }
        : null;
    const inventory = tenancy?.inventorySharedAt ? await inventoryOf(tx, tenancy.id) : [];
    // M38: before an invitation, only the street, if the letter chose that.
    const address = await renterAddress(tx, row.letting, row.application.status);
    return {
      address,
      inventory,
      payTo,
      tenancy: tenancy ?? null,
      homeOffer,
      checks,
      offer,
      slots,
      booking,
      ...row,
      criteria,
      questions: questionsFor(criteria),
      firstViewing: firstSlot?.startsAt ?? null,
      // Answers can change until the operator has decided who to invite (R11).
      canChange: row.application.status === 'enquired' && row.letting.status === 'live',
    };
  });
}

export type SaveAnswersResult =
  { ok: true } | { ok: false; errors: Record<string, string> } | { ok: false; locked: true };

/** R9: saves the renter's answers, keeping only answers to questions that were asked. */
export async function saveRenterAnswers(
  token: string,
  values: Record<string, string>,
): Promise<SaveAnswersResult | null> {
  const page = await loadRenterPage(token);
  if (!page) return null;
  if (!page.canChange) return { ok: false, locked: true };
  const parsed = renterAnswersSchema(page.criteria).safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    return { ok: false, errors };
  }
  const answers: RenterAnswers = parsed.data;
  await withOrg(page.organisation.id, async (tx) => {
    await tx
      .update(applications)
      .set({ answers, answersAt: new Date() })
      .where(eq(applications.id, page.application.id));
    await recordEvent(tx, {
      organisationId: page.organisation.id,
      lettingId: page.letting.id,
      actor: { type: 'renter', applicationId: page.application.id },
      type: 'application.answered',
      subject: { type: 'application', id: page.application.id },
      data: {
        applicationId: page.application.id,
        questions: Object.keys(answers).length,
        changed: page.application.answersAt !== null,
      },
    });
  });
  return { ok: true };
}
