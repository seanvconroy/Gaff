import { TZDate } from '@date-fns/tz';
import { and, eq, inArray, isNull, like, ne, or } from 'drizzle-orm';
import { alertsSender, emailSender } from '@/adapters/email';
import { withPublic, withSystem } from '@/db/client';
import { alertDeliveries, publicListings, renterProfiles, savedSearches, users } from '@/db/schema';
import { alertEmail, type AlertSearch } from '@/copy/alerts';
import { alertMatches, DAILY_HOUR, type AlertableListing } from '@/domain/alerts/alerts';
import { slugify } from '@/domain/places/slug';
import { env } from '@/lib/env';
import { enqueue } from '@/server/jobs/enqueue';
import { recordPlatformEvent } from '@/server/record/platform-events';
import { stopToken } from './tokens';

/**
 * M86, M87: when a home goes live, or its rent drops, it's matched to saved searches, once
 * each (a unique key makes the job safe to run twice). Instant alerts go within minutes,
 * grouped per renter; daily ones at 8am.
 */
export async function matchListing(listingId: string, now = new Date()): Promise<number> {
  const [listing] = await withPublic((tx) =>
    tx
      .select({
        status: publicListings.status,
        county: publicListings.county,
        routingKey: publicListings.routingKey,
        latitude: publicListings.latitude,
        longitude: publicListings.longitude,
        rentCents: publicListings.rentCents,
        bedrooms: publicListings.bedrooms,
        bathrooms: publicListings.bathrooms,
        propertyType: publicListings.propertyType,
        availableFrom: publicListings.availableFrom,
        furnished: publicListings.furnished,
        petsConsidered: publicListings.petsConsidered,
        berBand: publicListings.berBand,
        facts: publicListings.facts,
        publishedAt: publicListings.publishedAt,
      })
      .from(publicListings)
      .where(eq(publicListings.listingId, listingId)),
  );
  if (!listing || listing.status !== 'live') return 0;
  const home = { ...listing, facts: listing.facts as AlertableListing['facts'] };
  return withSystem(async (tx) => {
    // Only searches that could contain the home: all of Ireland, its county, or its routing key.
    const searches = await tx
      .select({
        id: savedSearches.id,
        userId: savedSearches.userId,
        areaPath: savedSearches.areaPath,
        query: savedSearches.query,
        frequency: savedSearches.frequency,
      })
      .from(savedSearches)
      .where(
        and(
          ne(savedSearches.frequency, 'off'),
          or(
            eq(savedSearches.areaPath, '/to-rent'),
            eq(savedSearches.areaPath, `/to-rent/${slugify(home.county)}`),
            like(savedSearches.areaPath, `/to-rent/${slugify(home.county)}/%`),
            home.routingKey
              ? eq(savedSearches.areaPath, `/to-rent/${home.routingKey.toLowerCase()}`)
              : undefined,
          ),
        ),
      );
    const matched = searches.filter((s) => alertMatches(home, s, now));
    if (matched.length === 0) return 0;
    const added = await tx
      .insert(alertDeliveries)
      .values(matched.map((s) => ({ savedSearchId: s.id, listingId, userId: s.userId })))
      .onConflictDoNothing()
      .returning({ savedSearchId: alertDeliveries.savedSearchId });
    const addedIds = new Set(added.map((a) => a.savedSearchId));
    const instantUsers = new Set(
      matched.filter((s) => addedIds.has(s.id) && s.frequency === 'instant').map((s) => s.userId),
    );
    for (const userId of instantUsers) {
      await enqueue(
        tx,
        'alerts_send',
        { userId, frequency: 'instant' },
        {
          runAt: new Date(now.getTime() + env().ALERT_GROUP_SECONDS * 1000),
          jobKey: `alerts_send:${userId}`,
          jobKeyMode: 'preserve_run_at',
        },
      );
    }
    return added.length;
  });
}

/** Sends one renter their unsent alerts of one frequency, in one email. */
export async function sendAlerts(
  userId: string,
  frequency: 'instant' | 'daily',
  now = new Date(),
): Promise<number> {
  return withSystem(async (tx) => {
    const due = await tx
      .select({
        savedSearchId: alertDeliveries.savedSearchId,
        listingId: alertDeliveries.listingId,
        name: savedSearches.name,
      })
      .from(alertDeliveries)
      .innerJoin(savedSearches, eq(savedSearches.id, alertDeliveries.savedSearchId))
      .where(
        and(
          eq(alertDeliveries.userId, userId),
          isNull(alertDeliveries.sentAt),
          eq(savedSearches.frequency, frequency),
        ),
      );
    if (due.length === 0) return 0;
    // Every due delivery is marked sent, including homes no longer live: never sent later.
    await tx
      .update(alertDeliveries)
      .set({ sentAt: now })
      .where(
        and(
          eq(alertDeliveries.userId, userId),
          isNull(alertDeliveries.sentAt),
          inArray(
            alertDeliveries.savedSearchId,
            due.map((d) => d.savedSearchId),
          ),
        ),
      );
    const homes = await tx
      .select({
        listingId: publicListings.listingId,
        title: publicListings.title,
        slug: publicListings.slug,
        rentCents: publicListings.rentCents,
        availableFrom: publicListings.availableFrom,
      })
      .from(publicListings)
      .where(
        and(
          eq(publicListings.status, 'live'),
          inArray(
            publicListings.listingId,
            due.map((d) => d.listingId),
          ),
        ),
      );
    const byId = new Map(homes.map((h) => [h.listingId, h]));
    const appUrl = env().APP_URL;
    const searches = new Map<string, AlertSearch>();
    for (const d of due) {
      const home = byId.get(d.listingId);
      if (!home) continue;
      const search = searches.get(d.savedSearchId) ?? {
        name: d.name,
        stopUrl: `${appUrl}/alerts/stop/${stopToken('s', d.savedSearchId)}`,
        homes: [],
      };
      search.homes.push({
        title: home.title,
        rentCents: home.rentCents,
        availableFrom: home.availableFrom,
        url: `${appUrl}/home/${home.slug}`,
      });
      searches.set(d.savedSearchId, search);
    }
    if (searches.size === 0) return 0;
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
    const [profile] = await tx
      .select({ givenName: renterProfiles.givenName })
      .from(renterProfiles)
      .where(eq(renterProfiles.userId, userId));
    if (!user) return 0;
    const firstSearchId = [...searches.keys()][0]!;
    const stopAllUrl = `${appUrl}/api/alerts/stop/${stopToken('a', firstSearchId)}`;
    const email = alertEmail({
      givenName: profile?.givenName ?? 'there',
      frequency,
      searches: [...searches.values()],
      manageUrl: `${appUrl}/my/alerts`,
      stopAllUrl: `${appUrl}/alerts/stop/${stopToken('a', firstSearchId)}`,
      now,
    });
    await emailSender().send({
      to: user.email,
      from: alertsSender(),
      subject: email.subject,
      text: email.text,
      // RFC 8058: one-click unsubscribe from the mail app, without opening a page.
      headers: {
        'List-Unsubscribe': `<${stopAllUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    await tx
      .update(savedSearches)
      .set({ lastSentAt: now })
      .where(inArray(savedSearches.id, [...searches.keys()]));
    const count = [...searches.values()].reduce((n, s) => n + s.homes.length, 0);
    await recordPlatformEvent(tx, {
      type: 'alert.sent',
      actor: { type: 'system' },
      data: { homes: count, frequency },
    });
    return count;
  });
}

/** M86: the daily email, at 8am in Ireland. Safe to run more than once a day. */
export async function sendDailyAlerts(now = new Date()): Promise<number> {
  if (new TZDate(now, 'Europe/Dublin').getHours() < DAILY_HOUR) return 0;
  const renters = await withSystem((tx) =>
    tx
      .selectDistinct({ userId: alertDeliveries.userId })
      .from(alertDeliveries)
      .innerJoin(savedSearches, eq(savedSearches.id, alertDeliveries.savedSearchId))
      .where(and(isNull(alertDeliveries.sentAt), eq(savedSearches.frequency, 'daily'))),
  );
  let sent = 0;
  for (const { userId } of renters) sent += await sendAlerts(userId, 'daily', now);
  return sent;
}
