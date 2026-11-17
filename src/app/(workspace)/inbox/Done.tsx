'use client';

import { useEffect } from 'react';
import { useToast } from '@/ui/Toast';

/**
 * Says what was just done ("Sent"), once, as a toast, and takes the note of it out of the
 * address so reloading or sharing the page doesn't say it again.
 */
export function Done({ message }: { message: string }) {
  const toast = useToast();
  useEffect(() => {
    toast.show({ message });
    const url = new URL(window.location.href);
    url.searchParams.delete('done');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [toast, message]);
  return null;
}
