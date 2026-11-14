'use client';

import { Component, type ReactNode } from 'react';

/**
 * M120: nothing that goes wrong inside the map takes the page with it. Google's script is not
 * ours: when it refuses a key it takes its own map apart, and its markers then throw as Gaff
 * removes them. Anything thrown under this boundary, while the map is drawn or while it's taken
 * away, ends in the words given here instead, and the list (or the rest of the listing) carries
 * on. It wraps the place the map is swapped for its failure words, so it's still there when the
 * map goes.
 */
export class MapErrorBoundary extends Component<
  { fallback: ReactNode; onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
