/** Whether the person has asked for less motion: a move is then made at once, not animated. */
export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
