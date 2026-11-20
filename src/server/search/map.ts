import { cardLine, freeFrom } from '@/copy/search';
import type { MapPin } from '@/domain/map/points';
import { inBBox, type BBox } from '@/domain/places/geo';
import type { SearchFilters } from '@/domain/search/filters';
import { irishToday, formatRent } from '@/lib/format';
import { publicHomes } from '@/server/homes/public-homes';
import { searchOnGaff } from './query';
import { resolveSearch } from './where';

/**
 * M57, M117, M125: the search map's data. Pins are the homes that fit the search and have a
 * placed pin, at the point renters may see (`publicPoint`), inside the map's view. Each pin is
 * the home's public reference, its point, its rent and its card's line: nothing about any
 * person, and nothing the home's own page doesn't already show.
 */

/** A view holds at most this many pins: past it, the renter zooms in. */
export const MAX_PINS = 2000;

export interface MapAnswer {
  points: MapPin[];
  /** How many of the homes that fit have a pin, and how many fit: "3 of 5 homes on the map". */
  pinned: number;
  listed: number;
}

export async function mapPins(filters: SearchFilters, view: BBox): Promise<MapAnswer> {
  const resolved = await resolveSearch(filters);
  // BA-14: through the same query as the list, the homes that fit and nothing else.
  const { fits } = await searchOnGaff(resolved.filters, resolved.g, { fitsOnly: true });
  const pinned = fits.filter((home) => home.point);
  return {
    points: pinned
      .filter((home) => inBBox(home.point!, view))
      .slice(0, MAX_PINS)
      .map((home) => ({
        id: home.id,
        lat: home.point!.lat,
        lng: home.point!.lng,
        rentCents: home.rentCents,
        title: cardLine(home),
      })),
    pinned: pinned.length,
    listed: fits.length,
  };
}

/** M117: what a pin's mini card shows: the cover photo, the rent, the line and the date. */
export interface MapCard {
  id: string;
  href: string;
  title: string;
  line: string;
  free: string;
  photo: { src: string; alt: string } | null;
}

export async function mapCard(ref: string, now = new Date()): Promise<MapCard | null> {
  const [home] = await publicHomes({ ref, limit: 1 });
  if (!home) return null;
  return {
    id: home.ref,
    href: home.href,
    title: formatRent(home.home.monthlyRentCents),
    line: cardLine(home.home),
    free: freeFrom(home.home.availableFrom, irishToday(now)),
    // The card says the home in words beside it, so the picture adds none.
    photo: home.photos[0] ? { src: home.photos[0].src, alt: '' } : null,
  };
}
