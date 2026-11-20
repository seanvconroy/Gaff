'use client';

import { RenterFailed } from './States';

/**
 * States: a page under a renter's link couldn't load, or a button's action never arrived (the
 * connection dropped as they pressed it). The frame stays, with one sentence and "Try again",
 * which draws the page again as it stands now.
 */
export default function RenterError({ retry }: { error: unknown; retry: () => void }) {
  return <RenterFailed onRetry={retry} />;
}
