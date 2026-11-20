import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { documentStore } from '@/adapters/documents';
import { withSystem } from '@/db/client';
import { applications, checkDocuments, renterDocuments, tenancies } from '@/db/schema';
import { letterCopyDue } from '@/domain/documents/keeping';
import { irishToday } from '@/lib/format';
import type { DocumentStore } from '@/ports/document-store';
import { recordEvent } from '@/server/record/events';
import { dropFiles } from './files';

/**
 * P41, P49, rule 9 (BA-16): the nightly job that deletes documents on their dates. Across
 * organisations, so it runs as the system.
 * - The renter's own copies at their date: unshared ones 30 days after they were added, kept
 *   ones when they go out of date. The row and its reading go with the file.
 * - The letter's copies when the tenancy starts or the application closes, and 30 days after
 *   sharing at the latest: the file goes, and the reading stays with the application until its
 *   personal data goes (`clearSharedReadings`, from the retention sweep).
 * Each deletion is logged with IDs only.
 */
export async function sweepDocuments(
  now: Date = new Date(),
  options: { onlyOrganisationId?: string; store?: DocumentStore } = {},
): Promise<{ renterCopies: number; letterCopies: number }> {
  const store = options.store ?? documentStore();
  const today = irishToday(now);
  const renterKeys: Array<string | null> = [];
  const letterKeys: Array<string | null> = [];
  const counts = await withSystem(async (tx) => {
    const due = await tx
      .select({
        id: renterDocuments.id,
        storageKey: renterDocuments.storageKey,
        organisationId: applications.organisationId,
        lettingId: applications.lettingId,
      })
      .from(renterDocuments)
      .innerJoin(applications, eq(applications.id, renterDocuments.applicationId))
      .where(
        and(
          lte(renterDocuments.deleteAfter, now),
          options.onlyOrganisationId
            ? eq(applications.organisationId, options.onlyOrganisationId)
            : undefined,
        ),
      );
    for (const row of due) {
      renterKeys.push(row.storageKey);
      await tx.delete(renterDocuments).where(eq(renterDocuments.id, row.id));
      await recordEvent(tx, {
        organisationId: row.organisationId,
        lettingId: row.lettingId,
        actor: { type: 'system' },
        type: 'document.deleted',
        subject: { type: 'document', id: row.id },
        data: { documentId: row.id, copy: 'renter' },
      });
    }

    const held = await tx
      .select({
        id: checkDocuments.id,
        organisationId: checkDocuments.organisationId,
        lettingId: checkDocuments.lettingId,
        applicationId: checkDocuments.applicationId,
        storageKey: checkDocuments.storageKey,
        deleteAfter: checkDocuments.deleteAfter,
        applicationStatus: applications.status,
        personalDataDeletedAt: applications.personalDataDeletedAt,
      })
      .from(checkDocuments)
      .innerJoin(applications, eq(applications.id, checkDocuments.applicationId))
      .where(
        and(
          isNull(checkDocuments.deletedAt),
          options.onlyOrganisationId
            ? eq(checkDocuments.organisationId, options.onlyOrganisationId)
            : undefined,
        ),
      );
    const starts =
      held.length === 0
        ? []
        : await tx
            .select({ applicationId: tenancies.applicationId, startDate: tenancies.startDate })
            .from(tenancies)
            .where(
              inArray(
                tenancies.applicationId,
                held.map((h) => h.applicationId),
              ),
            );
    const startOf = new Map(starts.map((s) => [s.applicationId, s.startDate]));
    let letterCopies = 0;
    for (const row of held) {
      const due = letterCopyDue(
        {
          deleteAfter: row.deleteAfter,
          applicationStatus: row.applicationStatus,
          tenancyStartDate: startOf.get(row.applicationId) ?? null,
          personalDataDeleted: row.personalDataDeletedAt !== null,
        },
        now,
        today,
      );
      if (!due) continue;
      letterCopies += 1;
      letterKeys.push(row.storageKey);
      await tx
        .update(checkDocuments)
        .set({ storageKey: null, deletedAt: now })
        .where(eq(checkDocuments.id, row.id));
      await recordEvent(tx, {
        organisationId: row.organisationId,
        lettingId: row.lettingId,
        actor: { type: 'system' },
        type: 'document.deleted',
        subject: { type: 'document', id: row.id },
        data: { documentId: row.id, copy: 'letter' },
      });
    }
    return { renterCopies: due.length, letterCopies };
  });
  await dropFiles([...renterKeys, ...letterKeys], store);
  return counts;
}

/**
 * R26, P49: when an application's personal data goes, so do the readings shared from its
 * documents, and any of the renter's own copies made for it that they didn't keep. Called in the
 * retention sweep's transaction; returns the files to delete once it has committed.
 */
export async function clearSharedReadings(
  tx: Parameters<Parameters<typeof withSystem>[0]>[0],
  applicationId: string,
  now: Date,
): Promise<Array<string | null>> {
  const letter = await tx
    .select({ storageKey: checkDocuments.storageKey })
    .from(checkDocuments)
    .where(eq(checkDocuments.applicationId, applicationId));
  await tx
    .update(checkDocuments)
    .set({ readingSealed: null, storageKey: null, deletedAt: now })
    .where(eq(checkDocuments.applicationId, applicationId));
  const own = await tx
    .delete(renterDocuments)
    .where(and(eq(renterDocuments.applicationId, applicationId), isNull(renterDocuments.userId)))
    .returning({ storageKey: renterDocuments.storageKey });
  return [...letter, ...own].map((row) => row.storageKey);
}
