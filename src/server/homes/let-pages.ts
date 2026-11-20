import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { lettings } from '@/db/schema';
import { LET_PAGE_DAYS } from '@/domain/homes/home-page';
import { recordEvent } from '@/server/record/events';

/**
 * UX-LS-10 (rule 9): a let home's page says "This home has been let" for 30 days, then this job
 * takes it down. It runs in the nightly retention job; nobody removes a page by hand. Each
 * removal is logged on the letting, with no personal data. Across every lister, so it runs as
 * the system, as retention does.
 */
export async function endLetHomePages(
  now: Date = new Date(),
  /** Limits it to one organisation (for tests running side by side). */
  onlyOrganisationId?: string,
): Promise<{ removed: number }> {
  const before = new Date(now.getTime() - LET_PAGE_DAYS * 86_400_000);
  return withSystem(async (tx) => {
    const removed = await tx
      .update(lettings)
      .set({ pageRemovedAt: now })
      .where(
        and(
          onlyOrganisationId ? eq(lettings.organisationId, onlyOrganisationId) : undefined,
          eq(lettings.status, 'let'),
          isNull(lettings.pageRemovedAt),
          lte(sql`coalesce(${lettings.letAt}, ${lettings.closedAt})`, before),
        ),
      )
      .returning({ id: lettings.id, organisationId: lettings.organisationId });
    for (const letting of removed) {
      await recordEvent(tx, {
        organisationId: letting.organisationId,
        lettingId: letting.id,
        actor: { type: 'system' },
        type: 'letting.gaff_page_removed',
        data: { daysAfterLet: LET_PAGE_DAYS },
      });
    }
    return { removed: removed.length };
  });
}
