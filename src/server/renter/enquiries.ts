import { and, eq, isNull } from 'drizzle-orm';
import { cache } from 'react';
import { enquiryLine } from '@/copy/profile';
import { withOrg } from '@/db/client';
import { applications } from '@/db/schema';
import {
  countNeedingThem,
  enquiryIsOver,
  enquiryNeedsThem,
  sortEnquiries,
} from '@/domain/renter/enquiries';
import type { RenterView } from '@/domain/renter/path';
import { createAccessLink } from '@/server/access/links';
import { forgetEnquiries, ownEnquiries, ownEnquiry } from '@/server/accounts/enquiries';
import { type CoverPhoto, coverPhotosFor } from '@/server/lettings/cover-photo';
import { loadRenterPageFor } from './answers';
import { renterModelFor } from './model';

/**
 * UX-RH-1, UX-RH-3, UX-RH-5: a signed-in renter's Enquiries. Each row is one home they've asked
 * about: its photo, its address, and one line saying where they stand and what's next.
 *
 * The list of which homes is the renter's own (`ownEnquiries`). What each row says is read from
 * the application itself, in its organisation's scope, by the same loader and the same rules as
 * the page a private link opens, so the two always agree. Nothing here is visible to an operator,
 * and nothing is read that the renter's own page wouldn't show them.
 */
export interface EnquiryRow {
  applicationId: string;
  /** "12 Ranelagh Road" */
  address: string;
  photo: CoverPhoto | null;
  view: RenterView;
  /** "Book a viewing", "On the waiting list", "An offer: answer by Sunday 22 November, 6pm". */
  line: string;
  needsYou: boolean;
  /** UX-RH-5: let, closed or over for them. It stays, marked, until its details are deleted. */
  over: boolean;
  lastActivity: Date;
}

/**
 * The rows, in order: those that need the renter first. An enquiry whose details have been
 * deleted on schedule has nothing left to show: it is taken off their list (rule 9).
 *
 * Asked once per request, however many parts of the page ask (the list, the bar's count).
 */
export const enquiryRowsFor = cache(async (userId: string): Promise<EnquiryRow[]> => {
  const pointers = await ownEnquiries(userId);
  const rows: EnquiryRow[] = [];
  const gone: string[] = [];
  for (const pointer of pointers) {
    const page = await loadRenterPageFor(pointer.organisationId, pointer.applicationId);
    if (!page) {
      gone.push(pointer.applicationId);
      continue;
    }
    const model = renterModelFor(page);
    const photo = await withOrg(pointer.organisationId, async (tx) =>
      (await coverPhotosFor(tx, [page.letting.id])).get(page.letting.id),
    );
    const situation = {
      view: model.view,
      checkToDo: model.checks.next !== null,
      tenantTask: model.tenancy?.task ?? null,
    };
    rows.push({
      applicationId: pointer.applicationId,
      address: model.address,
      photo: photo ?? null,
      view: model.view,
      line: enquiryLine({
        view: model.view,
        operator: model.operator,
        viewing: model.viewings.booking?.when ?? null,
        place: model.viewings.place?.when ?? null,
        offerDeadline: model.offer?.deadline ?? null,
        checkToDo: situation.checkToDo,
        tenantTask: situation.tenantTask,
        tenancyStart: model.tenancy?.start ?? null,
        deleteBy: model.deleteBy,
      }),
      needsYou: enquiryNeedsThem(situation),
      over: enquiryIsOver(model.view),
      lastActivity: page.application.updatedAt,
    });
  }
  await forgetEnquiries(userId, gone);
  return sortEnquiries(rows);
});

/** UX-NV-21, UX-RH-2: how many of their homes need the renter now. */
export async function enquiriesNeedingThem(userId: string): Promise<number> {
  return countNeedingThem(await enquiryRowsFor(userId));
}

/**
 * UX-RH-3: opens one of a renter's own enquiries: a fresh private link to the same page their
 * emails open. Only for an enquiry in their own list, and only while its details are still held.
 * Returns the link's token, or null if there is nothing to open.
 *
 * A link's token is kept only as a hash (ADR-0013), so the one in their email can't be looked
 * up; a new one is made, for the same page, and ends with the others.
 */
export async function openEnquiry(userId: string, applicationId: string): Promise<string | null> {
  const pointer = await ownEnquiry(userId, applicationId);
  if (!pointer) return null;
  return withOrg(pointer.organisationId, async (tx) => {
    const [application] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(eq(applications.id, pointer.applicationId), isNull(applications.personalDataDeletedAt)),
      );
    if (!application) return null;
    return createAccessLink(tx, {
      organisationId: pointer.organisationId,
      purpose: 'renter',
      subjectId: pointer.applicationId,
    });
  });
}
