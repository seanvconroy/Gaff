import type { BBox, Point } from '@/domain/places/geo';
import type { SearchArea } from '@/domain/search/places';

/** A home on the map: the points endpoint's answer (M117). */
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  rentCents: number;
  title: string;
  /** The home's page is /home/{slug}. */
  slug: string;
}

/** A home's card on the map (M117): the mini card, and the phone's row of cards (M57). */
export interface MapCard {
  id: string;
  href: string;
  title: string;
  rent: string;
  rooms: string;
  photo: { src: string; srcSet: string; alt: string; width: number; height: number } | null;
}

/** What every map provider (Google, or the static stand-in) is given. */
export interface MapProviderProps {
  startBox: BBox;
  pins: MapPin[];
  hovered: string | null;
  chosen: string | null;
  onHover: (id: string | null) => void;
  onChoose: (id: string | null) => void;
  /** The view changed; `byRenter` when the renter moved it, not the page. */
  onMoved: (view: BBox, byRenter: boolean) => void;
  drawing: boolean;
  onDrawn: (outline: Point[]) => void;
  /** The search's area, drawn on the map: its circle, street, box or shape. */
  area: SearchArea;
  onFailed: () => void;
}

/** "€2,250": a pin's label. */
export function pinLabel(rentCents: number): string {
  return `€${Math.round(rentCents / 100).toLocaleString('en-IE')}`;
}
