import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { type Tx, withOrg, withSystem } from '@/db/client';
import { applications, lettingDailyCounts } from '@/db/schema';
import {
  countsAsOpen,
  HOME_COUNT_KEEP_DAYS,
  HOME_NUMBER_DAYS,
  type HomeCountKind,
  type HomeNumbers,
  homeNumbers,
} from '@/domain/lettings/home-numbers';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { resolvePublicHome } from '@/server/homes/public-homes';

/**
 * M92 (BA-13): a lister's numbers for one home on Gaff, without cookies. A page open is counted
 * from the page's own beacon, a save as it happens; nothing about who is ever stored, only a
 * number for the day. Enquiries are counted from the letting's applications. The lister reads
 * them on the letting's Home view; the nightly job deletes days over 13 months old.
 */

/** Adds one to today's count for a home, inside its organisation's transaction. */
export async function countForHome(
  tx: Tx,
  input: { organisationId: string; lettingId: string; kind: HomeCountKind; now?: Date },
): Promise<void> {
  const day = irishToday(input.now ?? new Date());
  const one = input.kind === 'opened' ? { opened: 1 } : { saved: 1 };
  await tx
    .insert(lettingDailyCounts)
    .values({ organisationId: input.organisationId, lettingId: input.lettingId, day, ...one })
    .onConflictDoUpdate({
      target: [lettingDailyCounts.lettingId, lettingDailyCounts.day],
      set:
        input.kind === 'opened'
          ? { opened: sql`${lettingDailyCounts.opened} + 1` }
          : { saved: sql`${lettingDailyCounts.saved} + 1` },
    });
}

/**
 * The page's beacon: a live home's page was opened. Known robots aren't counted; neither is a
 * reference that has no page. The user agent is read and let go.
 */
export async function countPageOpen(
  ref: string,
  userAgent: string | null,
  now: Date = new Date(),
): Promise<'counted' | 'ignored'> {
  if (!countsAsOpen(userAgent)) return 'ignored';
  const home = await resolvePublicHome(ref);
  if (!home) return 'ignored';
  await withOrg(home.organisationId, (tx) =>
    countForHome(tx, {
      organisationId: home.organisationId,
      lettingId: home.lettingId,
      kind: 'opened',
      now,
    }),
  );
  return 'counted';
}

/** The Irish days shown, newest first. */
function lastDays(now: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) =>
    irishToday(new Date(now.getTime() - i * 86_400_000)),
  );
}

/** M92: the letting's Home view: its numbers for the last fortnight. */
export async function homeNumbersFor(
  member: Member,
  lettingId: string,
  now: Date = new Date(),
): Promise<HomeNumbers> {
  const days = lastDays(now, HOME_NUMBER_DAYS);
  const since = days.at(-1)!;
  // Every member sees every letting (section 2): reading needs no "Help with this".
  return withOrg(member.organisationId, async (tx) => {
    const counted = await tx
      .select({
        day: lettingDailyCounts.day,
        opened: lettingDailyCounts.opened,
        saved: lettingDailyCounts.saved,
      })
      .from(lettingDailyCounts)
      .where(and(eq(lettingDailyCounts.lettingId, lettingId), gte(lettingDailyCounts.day, since)));
    const enquired = await tx
      .select({
        day: sql<string>`to_char(${applications.firstEnquiredAt} at time zone 'Europe/Dublin', 'YYYY-MM-DD')`,
        enquiries: count(),
      })
      .from(applications)
      .where(eq(applications.lettingId, lettingId))
      .groupBy(sql`1`);
    return homeNumbers([...counted, ...enquired], days);
  });
}

/** Rule 9: the nightly job deletes days over 13 months old. Counts only. */
export async function sweepHomeCounts(now: Date = new Date()): Promise<{ deleted: number }> {
  const before = irishToday(new Date(now.getTime() - HOME_COUNT_KEEP_DAYS * 86_400_000));
  const gone = await withSystem((tx) =>
    tx
      .delete(lettingDailyCounts)
      .where(lt(lettingDailyCounts.day, before))
      .returning({ day: lettingDailyCounts.day }),
  );
  return { deleted: gone.length };
}
