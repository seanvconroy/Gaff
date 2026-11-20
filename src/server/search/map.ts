import { developmentCopy } from '@/copy/developments';
import { cardLine, freeFrom } from '@/copy/search';
import { developmentHref, groupAlike } from '@/domain/developments/development';
import type { MapPin } from '@/domain/map/points';
import { inBBox, type BBox } from '@/domain/places/geo';
import type { SearchFilters } from '@/domain/search/filters';
import { irishToday, formatRent } from '@/lib/format';
import { publicHomes } from '@/server/homes/public-homes';
import { findHomes } from './homes';
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
  const { fits } = await findHomes(resolved.filters, resolved.g);
  const pinned = fits.filter((home) => home.point);
  // BA-15 (M75): a development's alike homes are one pin, as they are one card: at the first of
  // them, with the lowest rent, its card naming how many (`mapCard`).
  const pins = groupAlike(pinned).map((group) =>
    group.kind === 'one'
      ? { home: group.home, rentCents: group.home.rentCents, title: cardLine(group.home) }
      : {
          home: group.homes[0]!,
          rentCents: Math.min(...group.homes.map((home) => home.rentCents)),
          title: `${developmentCopy.search.alike(group.homes.length)} · ${cardLine(group.homes[0]!)}`,
        },
  );
  return {
    points: pins
      .filter(({ home }) => inBBox(home.point!, view))
      .slice(0, MAX_PINS)
      .map(({ home, rentCents, title }) => ({
        id: home.id,
        lat: home.point!.lat,
        lng: home.point!.lng,
        rentCents,
        title,
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
  if (home.unit) {
    // BA-15: a development's home stands for its type's free homes there, as its pin does.
    const unit = home.unit;
    const alike = (await publicHomes({ developmentRef: unit.developmentRef })).filter(
      (each) => each.unit?.typeRef === unit.typeRef,
    );
    if (alike.length > 1) {
      const soonest = alike.map((each) => each.home.availableFrom).sort()[0]!;
      return {
        id: home.ref,
        href: developmentHref(unit.developmentRef, unit.typeRef),
        title: developmentCopy.search.from(
          Math.min(...alike.map((each) => each.home.monthlyRentCents)),
        ),
        line: `${developmentCopy.search.alike(alike.length)} · ${unit.developmentName}`,
        free: freeFrom(soonest, irishToday(now)),
        photo: home.photos[0] ? { src: home.photos[0].src, alt: '' } : null,
      };
    }
  }
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
