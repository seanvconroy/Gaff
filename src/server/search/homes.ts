import type { SearchFilters } from '@/domain/search/filters';
import type { Gazetteer } from '@/domain/search/places';
import { type SearchableHome, type SearchResults, searchHomes } from '@/domain/search/match';
import { publicHomesForSearch } from '@/server/homes/public-homes';
import type { CoverPhoto } from '@/server/lettings/cover-photo';

/**
 * The homes search reads (UX-SR-2, UX-SR-6, UX-SR-7): every home that has a public page, across
 * every lister. Which homes those are is decided in one place, the public query for homes on
 * Gaff (src/server/homes/public-homes.ts), so search and a home's page can never disagree. It
 * reads the home's own facts and its letting's fixed terms, and nothing about any person.
 *
 * A home is known here by its public reference, never its internal ID (`id` is the reference).
 *
 * Every home is read and matched in Gaff's own code (src/domain/search/match.ts). That is right
 * for the number of homes on Gaff in the pilots; a search in the database replaces it when the
 * list grows, with the same rules.
 */
export interface HomeOnGaff extends SearchableHome {
  cover: CoverPhoto | null;
}

export async function liveHomesOnGaff(): Promise<HomeOnGaff[]> {
  const homes = await publicHomesForSearch();
  return homes.map(({ home, addressLine2, eircode, point }) => ({
    id: home.ref,
    addressLine1: home.home.addressLine1,
    addressLine2,
    area: home.home.area,
    county: home.home.county,
    eircode,
    point,
    rentCents: home.home.monthlyRentCents,
    availableFrom: home.home.availableFrom,
    propertyType: home.home.propertyType,
    bedrooms: home.home.bedrooms,
    furnished: home.home.furnished,
    parking: home.home.parking,
    criteria: home.home.criteria,
    liveAt: home.liveAt,
    // The address is beside it on the card, so the picture adds no words.
    cover: home.photos[0] ? { src: home.photos[0].small, alt: '' } : null,
  }));
}

/**
 * UX-SR-7: the homes for a search, fits first and then those close to it. `g` holds its place
 * (`resolveSearch` in ./where.ts). The search itself is
 * used and let go: it isn't stored, logged or tied to anyone (UX-SR-11).
 */
export async function findHomes(
  filters: SearchFilters,
  g: Gazetteer,
): Promise<SearchResults<HomeOnGaff>> {
  return searchHomes(await liveHomesOnGaff(), filters, g);
}
