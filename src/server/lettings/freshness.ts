import { createHmac, timingSafeEqual } from 'node:crypto';
import { type SQL, and, eq, inArray, sql } from 'drizzle-orm';
import { type Tx, withOrg, withSystem } from '@/db/client';
import { lettings } from '@/db/schema';
import {
  defaultFreshness,
  type FreshnessFacts,
  type FreshnessShown,
  freshnessChangeEvents,
  freshnessShown,
  freshnessStep,
  freshSince,
} from '@/domain/lettings/freshness';
import { env } from '@/lib/env';
import type { Member } from '@/server/auth/member';
import { queueWaitingFirstReplies } from '@/server/enquiries/first-reply';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';
import { assertMayActOn } from '@/server/team/permissions';

/**
 * M49 (BA-13): keeping live homes fresh. Once a day the sweep asks the lister of any live home
 * with no change and no "Still available" for 14 days, on Today and in one fixed email with a
 * signed link; three days after an ask nobody answered, the home steps back from Gaff's public
 * pages and search (`lettings.stale_at`), and its enquiries wait, as a hidden home's do, until
 * the lister confirms. A home with a viewing booked ahead or an offer out is being let, and
 * counts as fresh. The rules are in src/domain/lettings/freshness.ts.
 *
 * The sweep finds candidates across organisations as the system, then acts on each inside its
 * own organisation. Confirming needs no sign-in when it comes from the email's link.
 */

/**
 * The lister's last change that restarts the clock: a person's, on this letting. Written with
 * whole column names, as drizzle leaves a one-table select's columns unqualified.
 */
const changedAt = sql<Date | null>`(
  select max(e.occurred_at) from events e
  where e.organisation_id = "lettings"."organisation_id"
    and e.letting_id = "lettings"."id"
    and e.actor_type = 'person'
    and e.type in (${sql.join(
      freshnessChangeEvents.map((type) => sql`${type}`),
      sql`, `,
    )})
)`;

/** M49: a viewing booked ahead, or an offer out: the home is being let. */
const beingLet = (now: Date) => sql<boolean>`(
  exists (
    select 1 from bookings b
    inner join viewing_slots s on s.id = b.slot_id
    where b.letting_id = "lettings"."id"
      and b.status = 'booked'
      and s.starts_at > ${now.toISOString()}::timestamptz
  )
  or exists (
    select 1 from offers o
    where o.letting_id = "lettings"."id" and o.status = 'open'
  )
)`;

const toDate = (value: Date | string | null): Date | null =>
  value === null ? null : value instanceof Date ? value : new Date(value);

/** Each live letting's clock, as the rules read it. */
async function clocks(tx: Tx, where: SQL | undefined, now: Date) {
  const rows = await tx
    .select({
      id: lettings.id,
      organisationId: lettings.organisationId,
      liveAt: lettings.liveAt,
      confirmedAt: lettings.confirmedAvailableAt,
      askedAt: lettings.freshnessAskedAt,
      staleAt: lettings.staleAt,
      changedAt,
      beingLet: beingLet(now),
    })
    .from(lettings)
    .where(and(eq(lettings.status, 'live'), where));
  return rows.map((row) => ({
    id: row.id,
    organisationId: row.organisationId,
    facts: {
      since: freshSince({
        liveAt: row.liveAt,
        confirmedAt: row.confirmedAt,
        changedAt: toDate(row.changedAt),
      }),
      askedAt: row.askedAt,
      staleAt: row.staleAt,
      beingLet: Boolean(row.beingLet),
    } satisfies FreshnessFacts,
  }));
}

/**
 * What Today and the letting show about each live home's freshness, inside the organisation's
 * own transaction. A home with nothing to say is left out.
 */
export async function freshnessShownIn(
  tx: Tx,
  now: Date = new Date(),
  lettingIds?: readonly string[],
): Promise<Map<string, FreshnessShown>> {
  if (lettingIds && lettingIds.length === 0) return new Map();
  const found = await clocks(
    tx,
    lettingIds ? inArray(lettings.id, [...lettingIds]) : undefined,
    now,
  );
  const shown = new Map<string, FreshnessShown>();
  for (const one of found) {
    const said = freshnessShown(one.facts);
    if (said) shown.set(one.id, said);
  }
  return shown;
}

/** The letting's page: whether it's asking, or has stepped back. */
export async function freshnessOf(
  member: Member,
  lettingId: string,
  now: Date = new Date(),
): Promise<FreshnessShown | null> {
  const shown = await withOrg(member.organisationId, (tx) =>
    freshnessShownIn(tx, now, [lettingId]),
  );
  return shown.get(lettingId) ?? null;
}

/**
 * M49: the email's "Still available" link: signed with the app's secret over the letting and
 * the ask it answers, so nothing needs storing. It works until the home is next confirmed or
 * changed, or asked again: then the link has done its job.
 */
function mac(lettingId: string, askedAt: Date): string {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`still-available:${lettingId}:${askedAt.toISOString()}`)
    .digest('base64url');
}

export const stillAvailablePath = (lettingId: string, askedAt: Date) =>
  `/still-available/${lettingId}/${mac(lettingId, askedAt)}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAC = /^[A-Za-z0-9_-]{43}$/;

/** M49: confirms it, in the organisation's transaction. A home that stepped back comes back. */
async function confirmIn(
  tx: Tx,
  input: {
    organisationId: string;
    lettingId: string;
    actor: { type: 'person'; userId: string } | { type: 'system' };
    via: 'gaff' | 'email';
    now: Date;
  },
): Promise<{ address: string; wasStale: boolean }> {
  const [letting] = await tx
    .select({
      status: lettings.status,
      staleAt: lettings.staleAt,
      address: lettings.addressLine1,
    })
    .from(lettings)
    .where(eq(lettings.id, input.lettingId))
    .for('update');
  if (!letting) throw new UserFacingError('We couldn’t find that letting.');
  if (letting.status !== 'live') {
    throw new UserFacingError('Only a home that’s taking enquiries can be confirmed.');
  }
  const wasStale = letting.staleAt !== null;
  await tx
    .update(lettings)
    .set({ confirmedAvailableAt: input.now, staleAt: null })
    .where(eq(lettings.id, input.lettingId));
  // As when a hidden home comes back: what waited goes now, on the lister's decision to go live.
  const firstReplies = wasStale
    ? await queueWaitingFirstReplies(tx, input.organisationId, input.lettingId)
    : 0;
  await recordEvent(tx, {
    organisationId: input.organisationId,
    lettingId: input.lettingId,
    actor: input.actor,
    type: 'letting.confirmed_available',
    data: { via: input.via, wasStale, firstReplies },
  });
  return { address: letting.address, wasStale };
}

/** M49: "Still available", from Today's task or the letting. */
export async function confirmStillAvailable(
  member: Member,
  lettingId: string,
  now: Date = new Date(),
): Promise<{ wasStale: boolean }> {
  return withOrg(member.organisationId, async (tx) => {
    await assertMayActOn(tx, member, lettingId);
    const { wasStale } = await confirmIn(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'person', userId: member.userId },
      via: 'gaff',
      now,
    });
    return { wasStale };
  });
}

/** What the email's link opens on: the home, if the link still answers its ask. */
async function byLink(lettingId: string, token: string, now: Date) {
  if (!UUID.test(lettingId) || !MAC.test(token)) return null;
  const [row] = await withSystem((tx) =>
    tx
      .select({ organisationId: lettings.organisationId, address: lettings.addressLine1 })
      .from(lettings)
      .where(and(eq(lettings.id, lettingId), eq(lettings.status, 'live'))),
  );
  if (!row) return null;
  const [clock] = await withOrg(row.organisationId, (tx) =>
    clocks(tx, eq(lettings.id, lettingId), now),
  );
  // Answered since (confirmed or changed), or asked again: this link has done its job.
  const askedAt = clock?.facts.askedAt ?? null;
  if (!clock || !askedAt || !freshnessShown(clock.facts)) return null;
  const expected = Buffer.from(mac(lettingId, askedAt));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return {
    organisationId: row.organisationId,
    address: row.address,
    shown: freshnessShown(clock.facts)!,
  };
}

/** The page the email's link opens: the home's address, or null if the link no longer works. */
export async function stillAvailableByLink(
  lettingId: string,
  token: string,
  now: Date = new Date(),
): Promise<{ address: string; shown: FreshnessShown } | null> {
  const found = await byLink(lettingId, token, now);
  return found ? { address: found.address, shown: found.shown } : null;
}

/**
 * M49: "Still available" from the email, with no sign-in. The page asks first, so a mail
 * scanner opening the link changes nothing. The link proves it came from the latest ask.
 */
export async function confirmByLink(
  lettingId: string,
  token: string,
  now: Date = new Date(),
): Promise<{ address: string } | null> {
  const found = await byLink(lettingId, token, now);
  if (!found) return null;
  return withOrg(found.organisationId, async (tx) => {
    const { address } = await confirmIn(tx, {
      organisationId: found.organisationId,
      lettingId,
      actor: { type: 'system' },
      via: 'email',
      now,
    });
    return { address };
  });
}

/**
 * M49: daily. Asks the lister of each home whose clock has run 14 days, once; steps back each
 * home whose ask went unanswered for 3 days. Counts only in the result.
 */
export async function sweepFreshness(
  now: Date = new Date(),
  /** Limits the sweep to one organisation (for tests running side by side). */
  onlyOrganisationId?: string,
): Promise<{ asked: number; steppedBack: number }> {
  const policy = defaultFreshness;
  const candidates = await withSystem((tx) =>
    clocks(
      tx,
      onlyOrganisationId ? eq(lettings.organisationId, onlyOrganisationId) : undefined,
      now,
    ),
  );
  let asked = 0;
  let steppedBack = 0;
  for (const candidate of candidates) {
    const step = freshnessStep(candidate.facts, now, policy);
    if (step === 'none') continue;
    await withOrg(candidate.organisationId, async (tx) => {
      const base = {
        organisationId: candidate.organisationId,
        lettingId: candidate.id,
        actor: { type: 'system' } as const,
      };
      if (step === 'ask') {
        await tx
          .update(lettings)
          .set({ freshnessAskedAt: now })
          .where(eq(lettings.id, candidate.id));
        await recordEvent(tx, {
          ...base,
          type: 'letting.freshness_asked',
          data: { days: policy.askAfterDays },
        });
        await enqueue(tx, 'send_account_email', {
          kind: 'still_available',
          organisationId: candidate.organisationId,
          lettingId: candidate.id,
          askedAt: now.toISOString(),
        });
        asked += 1;
      } else {
        await tx.update(lettings).set({ staleAt: now }).where(eq(lettings.id, candidate.id));
        await recordEvent(tx, {
          ...base,
          type: 'letting.stepped_back',
          data: { reason: 'not_confirmed', days: policy.graceDays },
        });
        steppedBack += 1;
      }
    });
  }
  return { asked, steppedBack };
}
