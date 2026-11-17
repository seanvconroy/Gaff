'use client';

import { searchCopy } from '@/copy/search';
import { Button } from '@/ui/Button';
import { HeartButton } from '@/ui/HeartButton';
import { useToast } from '@/ui/Toast';

/**
 * Seams for work package WP-23 (saved homes, saved searches and alerts, UX-SR-10). The heart on
 * each card and "Tell me when one comes up" are in place and say plainly that saving isn't here
 * yet. Nothing is kept: no home, no search, no email. WP-23 replaces what each one does.
 */
export function SaveHome({ label }: { label: string }) {
  const toast = useToast();
  return (
    <HeartButton label={label} onPress={() => toast.show({ message: searchCopy.seams.saveHome })} />
  );
}

/**
 * UX-SR-9: the empty state's one primary action. On the first screen with no homes on Gaff at
 * all, the Search button is the primary one, so this is secondary (UX-DS-2).
 */
export function TellMeWhen({ primary }: { primary: boolean }) {
  const toast = useToast();
  return (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      onClick={() => toast.show({ message: searchCopy.seams.alert })}
    >
      {searchCopy.empty.action}
    </Button>
  );
}
