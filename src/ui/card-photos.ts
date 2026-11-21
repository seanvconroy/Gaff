/**
 * UX-SR-6: where a card's photos have come to, as dots. At most five are shown, as a window that
 * moves with the photo in view; a dot at an edge of the window is small while there are more
 * photos past it, so the row says "there's more" without growing.
 */
export interface PhotoDot {
  /** The photo this dot stands for, from 0. */
  index: number;
  current: boolean;
  /** More photos lie past this edge of the window. */
  small: boolean;
}

export const MAX_DOTS = 5;

export function dotsFor(count: number, shown: number): PhotoDot[] {
  if (count < 2) return [];
  const at = Math.min(count - 1, Math.max(0, shown));
  const size = Math.min(count, MAX_DOTS);
  const first = Math.min(count - size, Math.max(0, at - Math.floor(size / 2)));
  return Array.from({ length: size }, (_, i) => {
    const index = first + i;
    return {
      index,
      current: index === at,
      small: (i === 0 && first > 0) || (i === size - 1 && first + size < count),
    };
  });
}

/** Which photo a strip has come to: the one most in view, by how far it has scrolled. */
export function photoInView(scrollLeft: number, width: number, count: number): number {
  if (width <= 0 || count < 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(Math.abs(scrollLeft) / width)));
}
