import { and, asc, eq } from 'drizzle-orm';
import { cache } from 'react';
import { withSystem } from '@/db/client';
import { developments, lettingPhotos, unitTypes } from '@/db/schema';
import {
  berRange,
  typesOnPage,
  type FreeHome,
  type TypeOnPage,
} from '@/domain/developments/development';
import { isPublicRef, placeOf, type PublicLister } from '@/domain/homes/home-page';
import {
  type PublicHome,
  type PublicPhoto,
  publicHomes,
  publicPhotoOf,
} from '@/server/homes/public-homes';

/**
 * M75 (BA-15): a development's public page, at `/developments/<publicRef>`. It is made only from
 * its homes that have pages of their own (the public query for homes, so the two can never
 * disagree), its shared photos, and facts about the scheme. A development none of whose homes
 * is public has no page. Nothing about any person, and no internal ID.
 */

export interface PublicDevelopmentHome extends FreeHome {
  href: string;
}

export interface PublicDevelopment {
  ref: string;
  name: string;
  /** "Sandyford, Dublin 18": the area and county, as a home's page says them. */
  area: string;
  county: string;
  place: string;
  description: string | null;
  parking: string | null;
  /** "A2 to A3", across the free homes. */
  ber: string | null;
  photos: PublicPhoto[];
  types: TypeOnPage<PublicDevelopmentHome>[];
  /** How many homes are free, across the types. */
  free: number;
  lister: PublicLister;
}

export const publicDevelopmentPage = cache(
  async (ref: string): Promise<PublicDevelopment | null> => {
    if (!isPublicRef(ref)) return null;
    const homes = await publicHomes({ developmentRef: ref });
    if (homes.length === 0) return null;
    const read = await withSystem(async (tx) => {
      const [development] = await tx
        .select({
          id: developments.id,
          name: developments.name,
          area: developments.area,
          county: developments.county,
          description: developments.description,
          parking: developments.parking,
        })
        .from(developments)
        .where(eq(developments.publicRef, ref));
      if (!development) return null;
      const types = await tx
        .select({
          ref: unitTypes.publicRef,
          name: unitTypes.name,
          propertyType: unitTypes.propertyType,
          bedrooms: unitTypes.bedrooms,
          bathrooms: unitTypes.bathrooms,
          floorAreaSqm: unitTypes.floorAreaSqm,
          berRating: unitTypes.berRating,
        })
        .from(unitTypes)
        .where(eq(unitTypes.developmentId, development.id));
      const photos = await tx
        .select({
          storageKey: lettingPhotos.storageKey,
          widths: lettingPhotos.widths,
          kind: lettingPhotos.kind,
        })
        .from(lettingPhotos)
        .where(
          and(eq(lettingPhotos.developmentId, development.id), eq(lettingPhotos.kind, 'photo')),
        )
        .orderBy(asc(lettingPhotos.position));
      return { development, types, photos };
    });
    if (!read) return null;
    const free = homes.filter(
      (home): home is PublicHome & { unit: NonNullable<PublicHome['unit']> } => Boolean(home.unit),
    );
    const area = read.development.area ?? free[0]!.home.area;
    return {
      ref,
      name: read.development.name,
      area,
      county: read.development.county ?? free[0]!.home.county,
      place: placeOf(area),
      description: read.development.description,
      parking: read.development.parking,
      ber: berRange(free.map((home) => home.home.berRating)),
      photos: read.photos.map(publicPhotoOf),
      types: typesOnPage(
        read.types,
        free.map((home) => ({
          typeRef: home.unit.typeRef,
          ref: home.ref,
          href: home.href,
          unitLabel: home.unit.unitLabel,
          floor: home.unit.floor,
          rentCents: home.home.monthlyRentCents,
          availableFrom: home.home.availableFrom,
        })),
      ),
      free: free.length,
      lister: free[0]!.lister,
    };
  },
);
