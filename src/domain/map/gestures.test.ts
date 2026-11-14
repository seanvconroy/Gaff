import { describe, expect, it } from 'vitest';
import { GESTURE_WINDOW_MS, movedByRenter } from './gestures';

describe('M127: only the renter’s own move searches the map area', () => {
  it('counts a drag, a pinch, a scroll, a button or a key that the map has just settled from', () => {
    expect(movedByRenter({ gestureAt: 1000, pageMoveAt: null, settledAt: 1300 })).toBe(true);
    // A glide after letting go still belongs to the drag.
    expect(
      movedByRenter({ gestureAt: 1000, pageMoveAt: null, settledAt: 1000 + GESTURE_WINDOW_MS }),
    ).toBe(true);
  });

  it('never counts a move nobody touched the map for: a resize, a turned phone, a toolbar', () => {
    expect(movedByRenter({ gestureAt: null, pageMoveAt: null, settledAt: 5000 })).toBe(false);
    expect(movedByRenter({ gestureAt: null, pageMoveAt: 4900, settledAt: 5000 })).toBe(false);
  });

  it('never counts the page fitting a new search, even just after the renter touched the map', () => {
    // They tapped a pin, then chose a new place: the fit is the page’s.
    expect(movedByRenter({ gestureAt: 1000, pageMoveAt: 1400, settledAt: 1900 })).toBe(false);
    // The window was resized while a pin’s card was open.
    expect(movedByRenter({ gestureAt: 1000, pageMoveAt: 1000, settledAt: 1200 })).toBe(false);
  });

  it('counts the renter’s move after an earlier fit', () => {
    expect(movedByRenter({ gestureAt: 9000, pageMoveAt: 2000, settledAt: 9400 })).toBe(true);
  });

  it('doesn’t count a move long after their last touch', () => {
    expect(
      movedByRenter({ gestureAt: 1000, pageMoveAt: null, settledAt: 1001 + GESTURE_WINDOW_MS }),
    ).toBe(false);
  });
});
