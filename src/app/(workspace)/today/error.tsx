'use client';

import { LoadFailed } from '../LoadFailed';

/** Offline, or failed to load: said in place of the content, with "Try again". */
export default function LoadError({ reset }: { error: Error; reset: () => void }) {
  return <LoadFailed onRetry={reset} />;
}
