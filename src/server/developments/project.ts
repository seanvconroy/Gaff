import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { developments, homes, listings, media, publicDevelopments } from '@/db/schema';
import { approximateLocation } from '@/domain/places/locate';
import { loadGazetteer } from '@/server/places/places';
import { republishIfPublic } from '@/server/listings/editor';
import { letterCard } from '@/server/listings/context';

/**
 * M75 (ADR-0017): writes what renters see of a development, in the same transaction as the
 * change. A development that isn't live has no public page.
 */
export async function writePublicDevelopment(tx: Tx, developmentId: string, now = new Date()) {
  const [development] = await tx
    .select()
    .from(developments)
    .where(eq(developments.id, developmentId));
  if (!development || development.status !== 'live') {
    await tx.delete(publicDevelopments).where(eq(publicDevelopments.developmentId, developmentId));
    return;
  }
  const photos = await tx
    .select()
    .from(media)
    .where(
      and(
        eq(media.developmentId, developmentId),
        eq(media.kind, 'photo'),
        eq(media.status, 'ready'),
      ),
    )
    .orderBy(asc(media.position));
  const operator = await letterCard(tx, development.organisationId, development.createdBy, now);
  const located =
    development.latitude !== null && development.longitude !== null
      ? { lat: development.latitude, lng: development.longitude }
      : approximateLocation(development, await loadGazetteer([], tx)).point;
  const values = {
    developmentId,
    organisationId: development.organisationId,
    slug: development.slug,
    name: development.name,
    area: development.area,
    county: development.county,
    routingKey: development.routingKey,
    latitude: located.lat,
    longitude: located.lng,
    description: development.description ?? '',
    amenities: development.amenities,
    photos: photos.map((p) => ({
      key: `${p.organisationId}/${p.id}`,
      kind: 'photo',
      widths: p.widths ?? [],
      width: p.width ?? 0,
      height: p.height ?? 0,
      alt: p.altText,
      placeholder: p.placeholder,
      cgi: p.isCgi,
    })),
    // Only what the public page shows: the operator's public name and badges.
    operator: { kind: operator.kind, name: operator.name, badges: operator.badges },
  };
  await tx
    .insert(publicDevelopments)
    .values(values)
    .onConflictDoUpdate({
      target: publicDevelopments.developmentId,
      set: { ...values, updatedAt: now },
    });
}

/** M33: the development's homes show its photos too, so they're republished with it. */
export async function republishDevelopment(tx: Tx, developmentId: string, by: string | null) {
  await writePublicDevelopment(tx, developmentId);
  const open = await tx
    .select({ lettingId: listings.lettingId })
    .from(listings)
    .innerJoin(homes, eq(homes.id, listings.homeId))
    .where(
      and(
        eq(homes.developmentId, developmentId),
        inArray(listings.status, ['live', 'enquiries_closed', 'let_agreed']),
      ),
    );
  for (const { lettingId } of open) await republishIfPublic(tx, lettingId, by);
}
