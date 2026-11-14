import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { confirmAvailabilityEmail, listingPausedEmail } from '@/copy/listings';
import { db, withOrg, withSystem } from '@/db/client';
import { homes, lettings, listings, memberships, users } from '@/db/schema';
import { defaultFreshness, freshness, pausesAt } from '@/domain/listings/freshness';
import { listingTitle } from '@/domain/listings/projection';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { loadListing } from './context';
import { moveListing } from './publish';
import { writePublicListing } from './project';

/** A one-tap link to confirm a home is still available, valid until it's next confirmed. */
function confirmToken(listingId: string, confirmedAt: Date): string {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`confirm:${listingId}:${confirmedAt.toISOString()}`)
    .digest('base64url');
}

export function confirmLink(organisationId: string, listingId: string, confirmedAt: Date): string {
  return new URL(
    `/listings/confirm/${organisationId}/${listingId}/${confirmToken(listingId, confirmedAt)}`,
    env().APP_URL,
  ).toString();
}

/** M49: the letter confirms the home is still available. A paused listing goes live again. */
async function confirm(organisationId: string, listingId: string, by: string | null, now: Date) {
  await withOrg(organisationId, async (tx) => {
    const [row] = await tx
      .select({ lettingId: listings.lettingId })
      .from(listings)
      .where(eq(listings.id, listingId));
    if (!row) throw new UserFacingError('We couldn’t find that listing.');
    const context = (await loadListing(tx, row.lettingId))!;
    const status = context.listing.status;
    if (status !== 'live' && status !== 'paused') {
      throw new UserFacingError('Only a live or paused listing can be confirmed.');
    }
    await tx
      .update(listings)
      .set({ confirmedAt: now, reminderSentAt: null })
      .where(eq(listings.id, listingId));
    const confirmed = (await loadListing(tx, row.lettingId))!;
    if (status === 'paused') {
      await moveListing(tx, confirmed, 'live', 'letter', by, now);
    } else {
      await writePublicListing(tx, confirmed, 'live', now);
    }
    await recordEvent(tx, {
      organisationId,
      lettingId: row.lettingId,
      actor: by ? { type: 'person', userId: by } : { type: 'system' },
      type: 'listing.confirmed',
      subject: { type: 'listing', id: listingId },
      data: { listingId },
    });
  });
}

export async function confirmAvailable(member: Member, listingId: string, now = new Date()) {
  await confirm(member.organisationId, listingId, member.userId, now);
}

/** From the email: the token proves the link came from the latest reminder. */
export async function confirmAvailableByLink(
  organisationId: string,
  listingId: string,
  token: string,
  now = new Date(),
): Promise<'confirmed' | 'invalid'> {
  if (!/^[0-9a-f-]{36}$/i.test(organisationId) || !/^[0-9a-f-]{36}$/i.test(listingId)) {
    return 'invalid';
  }
  const [row] = await withOrg(organisationId, (tx) =>
    tx
      .select({ confirmedAt: listings.confirmedAt })
      .from(listings)
      .where(eq(listings.id, listingId)),
  );
  if (!row?.confirmedAt) return 'invalid';
  const expected = Buffer.from(confirmToken(listingId, row.confirmedAt));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
  await confirm(organisationId, listingId, null, now);
  return 'confirmed';
}

/**
 * M49: daily. A live listing not confirmed for 14 days gets a reminder; 3 days later it's paused
 * until the letter confirms. Candidates are found across organisations, then each is handled
 * inside its own organisation.
 */
export async function sweepFreshness(
  now = new Date(),
  /** Limits the sweep to one organisation (for support, and for tests running side by side). */
  onlyOrganisationId?: string,
): Promise<{ reminded: number; paused: number }> {
  const policy = defaultFreshness;
  const dueBefore = new Date(now.getTime() - policy.confirmEveryDays * 86_400_000);
  const candidates = await withSystem((tx) =>
    tx
      .select({
        organisationId: listings.organisationId,
        listingId: listings.id,
        lettingId: listings.lettingId,
        confirmedAt: listings.confirmedAt,
        reminderSentAt: listings.reminderSentAt,
        assignedTo: listings.assignedTo,
      })
      .from(listings)
      .where(
        and(
          eq(listings.status, 'live'),
          lt(listings.confirmedAt, dueBefore),
          onlyOrganisationId ? eq(listings.organisationId, onlyOrganisationId) : undefined,
        ),
      ),
  );
  let reminded = 0;
  let paused = 0;
  for (const c of candidates) {
    const state = freshness(now, c.confirmedAt!, policy);
    if (state === 'overdue') {
      await withOrg(c.organisationId, async (tx) => {
        const context = (await loadListing(tx, c.lettingId))!;
        await moveListing(tx, context, 'paused', 'freshness', null, now);
      });
      await tellTheLetter(c, 'paused');
      paused += 1;
    } else if (state === 'due' && (!c.reminderSentAt || c.reminderSentAt < c.confirmedAt!)) {
      await withOrg(c.organisationId, (tx) =>
        tx.update(listings).set({ reminderSentAt: now }).where(eq(listings.id, c.listingId)),
      );
      await tellTheLetter(c, 'reminder');
      reminded += 1;
    }
  }
  return { reminded, paused };
}

async function tellTheLetter(
  c: {
    organisationId: string;
    listingId: string;
    lettingId: string;
    confirmedAt: Date | null;
    assignedTo: string | null;
  },
  what: 'reminder' | 'paused',
): Promise<void> {
  const [home] = await withOrg(c.organisationId, (tx) =>
    tx
      .select({
        bedrooms: homes.bedrooms,
        propertyType: homes.propertyType,
        area: homes.area,
        addressLine1: homes.addressLine1,
      })
      .from(lettings)
      .innerJoin(homes, eq(homes.id, lettings.homeId))
      .where(eq(lettings.id, c.lettingId)),
  );
  // The agent handling it, or the admins if nobody is assigned.
  const people = await db()
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organisationId, c.organisationId),
        c.assignedTo ? eq(memberships.userId, c.assignedTo) : eq(memberships.role, 'admin'),
      ),
    );
  const link = confirmLink(c.organisationId, c.listingId, c.confirmedAt!);
  const content =
    what === 'reminder'
      ? confirmAvailabilityEmail({
          address: home!.addressLine1,
          title: listingTitle(home!),
          link,
          pausesOn: formatDate(pausesAt(c.confirmedAt!)),
        })
      : listingPausedEmail({ address: home!.addressLine1, title: listingTitle(home!), link });
  for (const person of people) {
    await emailSender().send({ to: person.email, from: gaffSender(), ...content });
  }
}
