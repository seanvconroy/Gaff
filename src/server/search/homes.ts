import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { withSystem } from '@/db/client';
import { lettings } from '@/db/schema';
import type { SearchFilters } from '@/domain/search/filters';
import { type SearchableHome, type SearchResults, searchHomes } from '@/domain/search/match';
import { type CoverPhoto, coverPhotosFor } from '@/server/lettings/cover-photo';

/**
 * The homes search reads (UX-SR-2, UX-SR-6, UX-SR-7): every letting that is live and on Gaff
 * (UX-LT-21), across every lister. It reads the home's own facts and its letting's fixed terms,
 * and nothing about any person: no lister's name or contact, no enquiry, no renter.
 *
 * WP-20 builds a home's public page and its own public query. Until the two are merged this is
 * search's own: `liveHomesOnGaff` is the one place that decides which homes are public, so at
 * merge it can become WP-20's query, or WP-20's can become this.
 *
 * Every home is read and matched in Gaff's own code (src/domain/search/match.ts). That is right
 * for the number of homes on Gaff in the pilots; a search in the database replaces it when the
 * list grows, with the same rules.
 */
export interface HomeOnGaff extends SearchableHome {
  cover: CoverPhoto | null;
}

export async function liveHomesOnGaff(): Promise<HomeOnGaff[]> {
  // Across organisations, read-only, homes only: what the public site shows.
  return withSystem(async (tx) => {
    const rows = await tx
      .select({
        id: lettings.id,
        addressLine1: lettings.addressLine1,
        addressLine2: lettings.addressLine2,
        area: lettings.area,
        county: lettings.county,
        eircode: lettings.eircode,
        rentCents: lettings.monthlyRentCents,
        availableFrom: lettings.availableFrom,
        propertyType: lettings.propertyType,
        bedrooms: lettings.bedrooms,
        furnished: lettings.furnished,
        parking: lettings.parking,
        criteria: lettings.criteria,
        liveAt: lettings.liveAt,
      })
      .from(lettings)
      .where(
        and(eq(lettings.status, 'live'), eq(lettings.onGaff, true), isNotNull(lettings.liveAt)),
      )
      .orderBy(desc(lettings.liveAt));
    const covers = await coverPhotosFor(
      tx,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({ ...row, liveAt: row.liveAt!, cover: covers.get(row.id) ?? null }));
  });
}

/**
 * UX-SR-7: the homes for a search, fits first and then those close to it. The search itself is
 * used and let go: it isn't stored, logged or tied to anyone (UX-SR-11).
 */
export async function findHomes(filters: SearchFilters): Promise<SearchResults<HomeOnGaff>> {
  return searchHomes(await liveHomesOnGaff(), filters);
}
