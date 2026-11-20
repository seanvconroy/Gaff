import { addressArea } from '@/domain/map/pin';
import type { Gazetteer, Place } from '@/domain/places/gazetteer';
import type { Point } from '@/domain/places/geo';
import { hasPlacePage } from '@/domain/search/place-pages';
import type { HomeAddress } from '@/domain/search/places';
import { isLike, similarHomes } from '@/domain/search/similar';
import { loadGazetteer } from '@/server/places/places';
import { type HomeOnGaff, liveHomesOnGaff } from './homes';

/**
 * M73, M74 (BA-12): similar homes for a home's page, live or let, from the same public query
 * search reads (`liveHomesOnGaff`), so a home shown here is one search would show too. Only facts
 * about the homes are read; nothing about whoever is looking.
 */

/** What a home is matched on: its facts, and where it is as search places it. */
export interface SimilarTarget extends HomeAddress {
  /** Its public reference: never shown among its own similar homes. */
  ref: string;
  propertyType: string;
  bedrooms: number;
  rentCents: number;
}

/** Where a home is: its public point, or else the centre of the area its address names. */
function whereIs(home: HomeAddress, g: Gazetteer): Point | null {
  return home.point ?? addressArea(home, g)?.centre ?? null;
}

const factsOf = (id: string, home: Omit<SimilarTarget, 'ref'>) => ({
  id,
  county: home.county,
  propertyType: home.propertyType,
  bedrooms: home.bedrooms,
  rentCents: home.rentCents,
});

export interface Similar {
  homes: HomeOnGaff[];
  /** The place the home is in, as the index knows it, for "See other homes in …". */
  place: Place | null;
}

async function similarAmong(target: SimilarTarget, homes: HomeOnGaff[]): Promise<Similar> {
  const g = await loadGazetteer();
  const facts = factsOf(target.ref, target);
  // Distance is worked out only for homes already like it.
  const like = homes
    .filter((home) => isLike(facts, factsOf(home.id, home)))
    .map((home) => ({ ...home, at: whereIs(home, g) }));
  const area = addressArea({ ...target, point: null }, g);
  return {
    homes: similarHomes({ ...facts, at: whereIs(target, g) }, like),
    place: area && hasPlacePage(area) ? area : null,
  };
}

/** Up to three live homes like this one, nearest first, and the place it is in. */
export async function similarTo(target: SimilarTarget): Promise<Similar> {
  return similarAmong(target, await liveHomesOnGaff());
}

/** A live home's similar homes, found by its public reference among the homes on Gaff. */
export async function similarToLiveHome(ref: string): Promise<Similar> {
  const homes = await liveHomesOnGaff();
  const home = homes.find((h) => h.id === ref);
  if (!home) return { homes: [], place: null };
  return similarAmong({ ...home, ref: home.id }, homes);
}
