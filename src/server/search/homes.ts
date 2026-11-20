import type { Tx } from '@/db/client';
import type { SearchFilters } from '@/domain/search/filters';
import type { Gazetteer } from '@/domain/search/places';
import type { SearchableHome, SearchResults } from '@/domain/search/match';
import {
  type PlacedHome,
  publicHomesForSearch,
  publicHomesForSearchIn,
} from '@/server/homes/public-homes';
import type { CoverPhoto } from '@/server/lettings/cover-photo';
import { searchOnGaff } from './query';

/**
 * The homes search reads (UX-SR-2, UX-SR-6, UX-SR-7): every home that has a public page, across
 * every lister. Which homes those are is decided in one place, the public query for homes on
 * Gaff (src/server/homes/public-homes.ts), so search and a home's page can never disagree. It
 * reads the home's own facts and its letting's fixed terms, and nothing about any person.
 *
 * A home is known here by its public reference, never its internal ID (`id` is the reference).
 *
 * BA-14: a search is answered by the database (`searchOnGaff`, src/server/search/query.ts),
 * by the same rules as the in-memory matcher (src/domain/search/match.ts), which stays as the
 * spec a test holds it to. The whole list (`liveHomesOnGaff`) is read only by that test and by
 * the saved-search job, which matches new homes against every saved search.
 */
export interface HomeOnGaff extends SearchableHome {
  cover: CoverPhoto | null;
  /**
   * BA-15 (M75): homes alike in one development share this key (their type's public
   * reference), so search can show them as one card (`groupAlike`). Null: a home on its own.
   */
  alikeKey: string | null;
  alike: { developmentRef: string; developmentName: string; typeName: string } | null;
}

export async function liveHomesOnGaff(): Promise<HomeOnGaff[]> {
  return (await publicHomesForSearch()).map(homeOnGaffOf);
}

/** The same, in a transaction the caller holds. */
export async function liveHomesOnGaffIn(tx: Tx): Promise<HomeOnGaff[]> {
  return (await publicHomesForSearchIn(tx)).map(homeOnGaffOf);
}

function homeOnGaffOf({ home, addressLine2, eircode, point }: PlacedHome): HomeOnGaff {
  return {
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
    alikeKey: home.unit?.typeRef ?? null,
    alike: home.unit
      ? {
          developmentRef: home.unit.developmentRef,
          developmentName: home.unit.developmentName,
          typeName: home.unit.typeName,
        }
      : null,
  };
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
  return searchOnGaff(filters, g);
}
