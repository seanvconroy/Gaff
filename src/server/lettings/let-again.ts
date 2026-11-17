import { and, eq } from 'drizzle-orm';
import { photoStore } from '@/adapters/photos';
import { withOrg } from '@/db/client';
import { lettingDrafts } from '@/db/schema';
import { letAgainAnswers } from '@/domain/lettings/add-letting';
import { canLetAgain } from '@/domain/lettings/setup';
import type { PhotoStore } from '@/ports/photo-store';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { startDraftIn } from './drafts';
import { copyPhotosIn } from './photos';
import { lettingDetailIn } from './queries';

/**
 * UX-LT-23: "Let it again", from a closed letting's menu. A new draft starts with everything
 * about the home from last time (the address, the facts, the description, the letting details,
 * the last rent, and its own copies of the photos) and opens on the review screen. The person
 * changes what's new and goes live.
 *
 * Only the home is carried over. Nobody who enquired, applied or lived there is read here, and
 * the letting before, with its record, stays exactly as it was.
 */
export async function letAgain(
  member: Member,
  lettingId: string,
  store: PhotoStore = photoStore(),
): Promise<{ id: string }> {
  return withOrg(member.organisationId, async (tx) => {
    const detail = await lettingDetailIn(tx, lettingId);
    if (!detail) throw new UserFacingError('We couldn’t find that letting.');
    if (!canLetAgain(detail.letting)) {
      throw new UserFacingError('A home can be let again once its letting is closed.');
    }
    // Pressed before and not finished: carry on with that one, rather than start a second.
    const [started] = await tx
      .select({ id: lettingDrafts.id })
      .from(lettingDrafts)
      .where(and(eq(lettingDrafts.previousLettingId, lettingId), eq(lettingDrafts.origin, 'again')))
      .limit(1);
    if (started) return started;

    const { letting } = detail;
    const draft = await startDraftIn(tx, member, {
      origin: 'again',
      review: true,
      previousLettingId: lettingId,
      answers: letAgainAnswers({
        addressLine1: letting.addressLine1,
        addressLine2: letting.addressLine2,
        area: letting.area,
        county: letting.county,
        eircode: letting.eircode,
        monthlyRentCents: letting.monthlyRentCents,
        propertyType: letting.propertyType,
        bedrooms: letting.bedrooms,
        bathrooms: letting.bathrooms,
        furnished: letting.furnished,
        berRating: letting.berRating,
        parking: letting.parking,
        description: letting.description,
        // The facts written about the home. Answers given to one renter's question stay with
        // the letting they were given in.
        facts: detail.facts.filter((fact) => fact.source === 'setup').map((fact) => fact.answer),
        criteria: letting.criteria,
        noSmokingIndoors: letting.noSmokingIndoors,
      }),
    });
    await copyPhotosIn(tx, member, { lettingId }, { draftId: draft.id }, store);
    return draft;
  });
}
