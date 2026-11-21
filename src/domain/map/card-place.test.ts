import { describe, expect, it } from 'vitest';
import { CARD_MARGIN, PIN_CLEAR, placeCard } from './card-place';

const map = { width: 640, height: 700 };
const card = { width: 320, height: 330 };

describe('M117: where a chosen pin’s card sits', () => {
  it('is under its pin, centred on it, when there’s room', () => {
    expect(placeCard({ x: 320, y: 200 }, map, card)).toEqual({
      left: 160,
      top: 200 + PIN_CLEAR.below,
      side: 'below',
    });
  });

  it('is over its pin when there’s no room under it', () => {
    expect(placeCard({ x: 320, y: 600 }, map, card)).toEqual({
      left: 160,
      top: 600 - PIN_CLEAR.above - card.height,
      side: 'above',
    });
  });

  it('is held in from the map’s sides', () => {
    expect(placeCard({ x: 10, y: 200 }, map, card)?.left).toBe(CARD_MARGIN);
    expect(placeCard({ x: 635, y: 200 }, map, card)?.left).toBe(640 - 320 - CARD_MARGIN);
  });

  it('is always whole inside the map, wherever the pin is', () => {
    for (const x of [-500, 0, 100, 320, 600, 2000]) {
      for (const y of [-500, 0, 150, 350, 500, 699, 2000]) {
        const place = placeCard({ x, y }, map, card)!;
        expect(place.left).toBeGreaterThanOrEqual(CARD_MARGIN);
        expect(place.left + card.width).toBeLessThanOrEqual(map.width - CARD_MARGIN);
        expect(place.top).toBeGreaterThanOrEqual(CARD_MARGIN);
        expect(place.top + card.height).toBeLessThanOrEqual(map.height - CARD_MARGIN);
      }
    }
  });

  it('lies across the pin only when neither side has room', () => {
    const short = { width: 640, height: 420 };
    expect(placeCard({ x: 320, y: 210 }, short, card)?.side).toBe('over');
    expect(placeCard({ x: 320, y: 20 }, short, card)?.side).toBe('below');
  });

  it('has no place on a map too small to hold it', () => {
    expect(placeCard({ x: 100, y: 100 }, { width: 300, height: 700 }, card)).toBeNull();
    expect(placeCard({ x: 100, y: 100 }, { width: 640, height: 300 }, card)).toBeNull();
  });
});
