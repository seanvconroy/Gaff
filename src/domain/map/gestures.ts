/**
 * M127: whose move was it? Moving the map searches the area in view, but only when the renter
 * moved it: by dragging, pinching, scrolling to zoom, the pan and zoom buttons, the keyboard, or
 * choosing a cluster. The page's own moves (fitting a new search), a window being resized, a
 * phone or tablet being turned, and a phone's toolbar coming or going never count.
 */

/** A move settles this long, at most, after the renter's last touch: glides and zooms included. */
export const GESTURE_WINDOW_MS = 1500;

export function movedByRenter(input: {
  /** When the renter last pressed, dragged, scrolled or typed on the map. */
  gestureAt: number | null;
  /** When the page last moved the map itself, or the map's size changed. */
  pageMoveAt: number | null;
  /** When the map came to rest. */
  settledAt: number;
}): boolean {
  const { gestureAt, pageMoveAt, settledAt } = input;
  if (gestureAt === null) return false;
  if (settledAt - gestureAt > GESTURE_WINDOW_MS) return false;
  // A fit or a resize after the renter's last touch: the move that followed was the page's.
  if (pageMoveAt !== null && pageMoveAt >= gestureAt) return false;
  return true;
}
