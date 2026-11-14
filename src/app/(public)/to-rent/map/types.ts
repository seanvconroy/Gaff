import type { MapFailure } from '@/domain/map/counts';
import type { PinGroup } from '@/domain/map/points';
import type { Scheme } from '@/domain/map/theme';
import type { BBox, Point } from '@/domain/places/geo';
import type { SearchArea } from '@/domain/search/places';

/** A home's card on the map (M117): the mini card, and the phone's row of cards (M57). */
export interface MapCard {
  id: string;
  href: string;
  title: string;
  rent: string;
  rooms: string;
  photo: { src: string; srcSet: string; alt: string; width: number; height: number } | null;
}

/**
 * What every map provider (Google, or the static stand-in) is given. Plain data down and events
 * up, so the two behave the same and the page's rules (when to fit, whose move it was, what a
 * drawn outline becomes) live in one place.
 */
export interface MapProviderProps {
  /** The box to show. A new `id` asks the map to fit it; nothing else moves the map (M127). */
  fit: { id: number; box: BBox };
  /** One pin for each home, or for the homes that share a point (M117). */
  groups: PinGroup[];
  /** The home a card or pin is pointing at, and the home that's chosen. */
  hovered: string | null;
  chosen: string | null;
  onHover: (homeId: string | null) => void;
  onChoose: (group: PinGroup) => void;
  /** The view changed; `byRenter` only when the renter moved it themselves (M127). */
  onMoved: (view: BBox, byRenter: boolean) => void;
  /** M56, M128: drawing an area: a drag draws round it, a tap adds a corner. */
  drawing: boolean;
  corners: Point[];
  onCorner: (point: Point) => void;
  onDrawn: (outline: Point[]) => void;
  /** The search's area, drawn on the map: its circle, street or shape. */
  area: SearchArea;
  /** M129, M130: the map's own scheme, which its pins follow. */
  scheme: Scheme;
  /** The map has drawn (M131). */
  onReady: () => void;
  onFailed: (kind: MapFailure) => void;
}
