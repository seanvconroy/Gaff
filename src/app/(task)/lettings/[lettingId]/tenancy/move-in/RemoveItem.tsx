'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/ui/Button';

/**
 * R25: takes one item out of the inventory before it's shared. A button of its own, not one of
 * the move-in form's, so pressing Enter in a field never removes anything.
 */
export function RemoveItem({
  remove,
  label,
  what,
}: {
  remove: () => Promise<void>;
  label: string;
  what: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="quiet"
      aria-disabled={pending}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await remove();
          router.refresh();
        })
      }
    >
      {pending ? 'Removing…' : label}
      <span className="visually-hidden">: {what}</span>
    </Button>
  );
}
