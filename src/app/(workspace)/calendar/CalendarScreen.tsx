'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, type ComponentProps } from 'react';
import { Button } from '@/ui/Button';
import { Calendar } from '@/ui/Calendar';
import { Sheet } from '@/ui/Sheet';
import { useToast } from '@/ui/Toast';
import { addTimeAction, type TimeFormState } from './actions';
import { TimeForm, type AheadTime, type TimeHome } from './TimeForm';
import { ViewingSheet, type ViewingSheetData } from './ViewingSheet';

/**
 * The calendar's screen (UX-VW-1, UX-VW-2): the calendar with its one primary action, "Add a
 * time", and the two sheets it opens: adding a time, and a viewing time's own sheet.
 */
export function CalendarScreen({
  calendar,
  homes,
  chosenHome,
  ahead,
  viewer,
  names,
  viewing,
  closeHref,
}: {
  calendar: Omit<ComponentProps<typeof Calendar>, 'action'>;
  homes: readonly TimeHome[];
  /** On a home's own calendar, the home. */
  chosenHome?: string;
  ahead: readonly AheadTime[];
  viewer: string;
  names: Record<string, string>;
  viewing: ViewingSheetData | null;
  /** Where closing a viewing's sheet goes: the same week and day. */
  closeHref: string;
}) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const home = homes.find((h) => h.id === chosenHome);

  const added = (done: NonNullable<TimeFormState['done']>) => {
    setAdding(false);
    toast.show({ message: done.message });
    // The calendar moves to the day of the new time, so it's in view.
    router.replace(`${pathname}?day=${done.date}`, { scroll: false });
  };

  const viewingHome = viewing ? homes.find((h) => h.id === viewing.lettingId) : undefined;
  return (
    <>
      <Calendar
        {...calendar}
        action={
          homes.length > 0 ? (
            <Button variant="primary" fullWidth="phone" onClick={() => setAdding(true)}>
              Add a time
            </Button>
          ) : undefined
        }
      />
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a time"
        description={home ? home.address : undefined}
      >
        <TimeForm
          homes={homes}
          chosenHome={chosenHome ?? (homes.length === 1 ? homes[0]!.id : undefined)}
          ahead={ahead}
          viewer={viewer}
          names={names}
          action={addTimeAction}
          submitLabel="Add"
          pendingLabel="Adding…"
          onDone={added}
        />
      </Sheet>
      {viewing && viewingHome ? (
        <ViewingSheet
          key={viewing.sessionId}
          data={viewing}
          home={viewingHome}
          ahead={ahead}
          viewer={viewer}
          names={names}
          closeHref={closeHref}
        />
      ) : null}
    </>
  );
}
