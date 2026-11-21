import type { MapArea } from '@/domain/map/camera';
import type { MapFailure } from '@/domain/map/counts';
import type { PinGroup } from '@/domain/map/points';
import type { Scheme } from '@/domain/map/theme';
import type { BBox, Point } from '@/domain/places/geo';

/**
 * UX-SR-13: how a provider's map turns places into positions in its own box and back, so what is
 * drawn over the map (a drawn area and its corners) is one piece of code for every provider. A
 * provider hands over a new one each time its view changes.
 */
export interface MapProjection {
  /** Where a point is, in CSS pixels from the map's top left corner. */
  toPixel: (point: Point) => { x: number; y: number };
  toPoint: (x: number, y: number) => Point;
}

/**
 * What every search map provider (Google, or the stand-in) is given. Plain data down and events
 * up, so the two behave the same and the page's rules (when to fit, whose move it was) live in
 * one place (SearchMap).
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
  /** The search's area, drawn on the map: a street and the distance around it. */
  area: MapArea;
  /** M129, M130: the map's own scheme, which its pins follow. */
  scheme: Scheme;
  /** UX-SR-13: told of every change of view, as it happens, for what is drawn over the map. */
  onProjection: (projection: MapProjection) => void;
  /** The map has drawn (M131). */
  onReady: () => void;
  onFailed: (kind: MapFailure) => void;
}
