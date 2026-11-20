'use client';

import { WifiOff } from 'lucide-react';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';

/**
 * A page that couldn't load (section 3, "States"; section 8, "Errors"): one sentence in place of
 * the content, and "Try again". The navigation round it stays where it is.
 */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={WifiOff}
      title="We couldn’t load this"
      action={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      <p>Check your connection.</p>
    </EmptyState>
  );
}
