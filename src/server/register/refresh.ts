import { and, desc, eq, inArray, isNotNull, isNull, notInArray, type SQL, sql } from 'drizzle-orm';
import { registerSource } from '@/adapters/register';
import { db, type Tx, withSystem } from '@/db/client';
import { organisations, psraRegister, psraRegisterRefreshes } from '@/db/schema';
import { parseRegister, refreshIsPlausible, RegisterFormatError } from '@/domain/register/parse';
import { searchTextFor } from '@/domain/register/search';
import type { RegisterSource } from '@/ports/register';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/** The PSRA updates its register weekly, and so does Gaff's copy (Q39). */
export const REFRESH_EVERY_DAYS = 7;

export interface RefreshResult {
  entries: number;
  added: number;
  removed: number;
  /** UX-AG-6: agencies on Gaff found lapsed, and found renewed, by this refresh. */
  lapsed: number;
  renewed: number;
}

/**
 * UX-AG-1, UX-AG-6 (Q39): the weekly refresh of Gaff's copy of the PSRA register, and the
 * re-check of every agency on Gaff against it.
 *
 * - The download is read and checked first (`parseRegister`). If it isn't the expected format,
 *   or has lost most of its businesses, this throws and the copy stays exactly as it was.
 * - Only businesses licensed to let are stored. A business no longer listed is kept, marked as
 *   gone, so the agency that holds it can be told; the search never offers it.
 * - An agency whose licence has gone is marked lapsed and its admins are emailed at once. Its
 *   live lettings carry on; no new one goes live until the licence is back (`goLiveGate`).
 *
 * It works across organisations, so it runs as the system (ADR-0004). It touches organisations
 * and the register only: no letting, renter or message.
 */
export async function refreshRegister(
  source: RegisterSource = registerSource(),
  now: Date = new Date(),
  /**
   * Limits the refresh to licence numbers that start with this (for tests running side by
   * side, as the retention job has): entries, removals and the re-check all keep within it.
   */
  onlyLicencesStarting?: string,
): Promise<RefreshResult> {
  const within = onlyLicencesStarting
    ? sql`${psraRegister.licenceNumber} like ${`${onlyLicencesStarting}%`}`
    : undefined;
  const entries = parseRegister(await source.read()).entries.filter(
    (entry) => !onlyLicencesStarting || entry.licenceNumber.startsWith(onlyLicencesStarting),
  );
  return withSystem(async (tx) => {
    // One refresh at a time: the weekly job and a first load can't run over each other.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('psra-register-refresh'))`);
    const held = await tx
      .select({ licenceNumber: psraRegister.licenceNumber, removedAt: psraRegister.removedAt })
      .from(psraRegister)
      .where(within);
    const listedNow = held.filter((entry) => entry.removedAt === null).length;
    if (!refreshIsPlausible(listedNow, entries.length)) {
      throw new RegisterFormatError(
        `it lists ${entries.length} businesses licensed to let, and Gaff's copy has ${listedNow}`,
      );
    }
    const known = new Set(held.map((entry) => entry.licenceNumber));
    const added = entries.filter((entry) => !known.has(entry.licenceNumber)).length;

    for (let i = 0; i < entries.length; i += 500) {
      await tx
        .insert(psraRegister)
        .values(
          entries.slice(i, i + 500).map((entry) => ({
            ...entry,
            searchText: searchTextFor(entry),
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: psraRegister.licenceNumber,
          set: {
            registeredName: sql`excluded.registered_name`,
            tradingName: sql`excluded.trading_name`,
            licenceType: sql`excluded.licence_type`,
            county: sql`excluded.county`,
            searchText: sql`excluded.search_text`,
            lastSeenAt: now,
            removedAt: null,
          },
        });
    }
    const gone = await tx
      .update(psraRegister)
      .set({ removedAt: now })
      .where(
        and(
          within,
          isNull(psraRegister.removedAt),
          notInArray(
            psraRegister.licenceNumber,
            entries.map((entry) => entry.licenceNumber),
          ),
        ),
      )
      .returning({ id: psraRegister.id });

    const { lapsed, renewed } = await recheckAgencies(tx, now, within);
    await tx.insert(psraRegisterRefreshes).values({
      source: source.name,
      finishedAt: now,
      entries: entries.length,
      added,
      removed: gone.length,
      lapsed,
      renewed,
    });
    return { entries: entries.length, added, removed: gone.length, lapsed, renewed };
  });
}

/** UX-AG-6: every agency on Gaff against the copy as it stands now. */
async function recheckAgencies(
  tx: Tx,
  now: Date,
  within: SQL | undefined,
): Promise<{ lapsed: number; renewed: number }> {
  const goneEntries = tx
    .select({ id: psraRegister.id })
    .from(psraRegister)
    .where(and(within, isNotNull(psraRegister.removedAt)));
  const listedEntries = tx
    .select({ id: psraRegister.id })
    .from(psraRegister)
    .where(and(within, isNull(psraRegister.removedAt)));

  const lapsed = await tx
    .update(organisations)
    .set({ licenceLapsedAt: now })
    .where(
      and(
        eq(organisations.kind, 'agency'),
        isNull(organisations.licenceLapsedAt),
        inArray(organisations.psraRegisterEntryId, goneEntries),
      ),
    )
    .returning({ id: organisations.id, registerEntryId: organisations.psraRegisterEntryId });
  for (const agency of lapsed) {
    await recordEvent(tx, {
      organisationId: agency.id,
      actor: { type: 'system' },
      type: 'organisation.licence_lapsed',
      data: { registerEntryId: agency.registerEntryId! },
    });
    // "The admins are told at once": the email is queued with the change, and sent by the worker.
    await enqueue(tx, 'send_account_email', { kind: 'licence_lapsed', organisationId: agency.id });
  }

  const renewed = await tx
    .update(organisations)
    .set({ licenceLapsedAt: null })
    .where(
      and(
        isNotNull(organisations.licenceLapsedAt),
        inArray(organisations.psraRegisterEntryId, listedEntries),
      ),
    )
    .returning({ id: organisations.id, registerEntryId: organisations.psraRegisterEntryId });
  for (const agency of renewed) {
    await recordEvent(tx, {
      organisationId: agency.id,
      actor: { type: 'system' },
      type: 'organisation.licence_renewed',
      data: { registerEntryId: agency.registerEntryId! },
    });
    await enqueue(tx, 'send_account_email', { kind: 'licence_renewed', organisationId: agency.id });
  }
  return { lapsed: lapsed.length, renewed: renewed.length };
}

/** When Gaff's copy was last refreshed, or null if it never has been. */
export async function lastRefreshedAt(): Promise<Date | null> {
  const [last] = await db()
    .select({ finishedAt: psraRegisterRefreshes.finishedAt })
    .from(psraRegisterRefreshes)
    .orderBy(desc(psraRegisterRefreshes.finishedAt))
    .limit(1);
  return last?.finishedAt ?? null;
}

/**
 * Queues the refresh if the copy is a week old, or has never been loaded. Called once a day
 * (the daily cron on Vercel) and as the local worker starts, so a new database gets its register
 * without anyone doing anything. The job key keeps it to one queued at a time.
 */
export async function queueRegisterRefreshIfDue(now: Date = new Date()): Promise<boolean> {
  const last = await lastRefreshedAt();
  // Half a day's slack, so a daily check at the same hour finds it due on the seventh day.
  const dueAfterMs = (REFRESH_EVERY_DAYS - 0.5) * 86_400_000;
  if (last && now.getTime() - last.getTime() < dueAfterMs) return false;
  await db().execute(sql`
    select graphile_worker.add_job('psra_register_refresh', '{}'::json, job_key => 'psra_register_refresh', max_attempts => 5)`);
  return true;
}
