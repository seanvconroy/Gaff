/**
 * M117: where a chosen pin's card sits on the map at 900px and up: beside its pin, as near as it
 * can be without covering it, and always whole inside the map. Under the pin when there's room,
 * over it when there isn't, and held in from the map's edges. Positions are CSS pixels from the
 * map's top left corner.
 */
export interface Box {
  width: number;
  height: number;
}

export interface CardPlace {
  left: number;
  top: number;
  /** Which side of the pin the card is on. `over`: neither fits, so it lies across the pin. */
  side: 'below' | 'above' | 'over';
}

/** A pin's pill is drawn at or just above its point: this much is kept clear either side. */
export const PIN_CLEAR = { above: 48, below: 28 } as const;
/** The card never comes nearer the map's edge than this. */
export const CARD_MARGIN = 12;

const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Null when the card can't be whole inside the map at all: it keeps its place at the foot. */
export function placeCard(pin: { x: number; y: number }, map: Box, card: Box): CardPlace | null {
  const room = { width: map.width - 2 * CARD_MARGIN, height: map.height - 2 * CARD_MARGIN };
  if (card.width > room.width || card.height > room.height) return null;
  const left = within(pin.x - card.width / 2, CARD_MARGIN, map.width - card.width - CARD_MARGIN);
  const below = pin.y + PIN_CLEAR.below;
  if (below >= CARD_MARGIN && below + card.height <= map.height - CARD_MARGIN) {
    return { left, top: below, side: 'below' };
  }
  const above = pin.y - PIN_CLEAR.above - card.height;
  if (above >= CARD_MARGIN && above + card.height <= map.height - CARD_MARGIN) {
    return { left, top: above, side: 'above' };
  }
  // No room either side (a short map, or a pin moved out of view): as near as the map allows.
  return {
    left,
    top: within(below, CARD_MARGIN, map.height - card.height - CARD_MARGIN),
    side: 'over',
  };
}
