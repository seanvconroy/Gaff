'use client';

import { CalendarPlus, Pencil, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { bookedLine, placesLeftLine, type TimeSettings } from '@/domain/viewings/calendar';
import { Button, ButtonLink, buttonProps } from '@/ui/Button';
import { Menu, MenuItem } from '@/ui/Menu';
import { Notice } from '@/ui/Notice';
import { Sheet } from '@/ui/Sheet';
import { StatusPill } from '@/ui/StatusPill';
import { useToast } from '@/ui/Toast';
import { cancelTimeAction, changeTimeAction, type TimeFormState } from './actions';
import styles from './calendar.module.css';
import { TimeForm, type AheadTime, type TimeHome } from './TimeForm';

/** What a viewing time's sheet shows (UX-VW-6). Instants as ISO strings. */
export interface ViewingSheetData {
  sessionId: string;
  lettingId: string;
  address: string;
  /** "Thursday 19 November, 6pm to 7pm". */
  when: string;
  startsAt: string;
  endsAt: string;
  /** Once it has started it can't be changed or cancelled. */
  started: boolean;
  /** UX-VW-10: from 15 minutes before, with people to mark. */
  canMark: boolean;
  places: number;
  booked: number;
  held: number;
  waiting: number;
  otherTimes: number;
  people: Array<{ bookingId: string; name: string; time: string; status: string }>;
  settings: TimeSettings & { date: string };
  markHref: string;
  calendarFile: string;
}

/**
 * Tapping a viewing time opens this (UX-VW-6): who's booked and when, the places left, the
 * waiting list, and a menu with "Change" and "Cancel this time". From 15 minutes before, "Mark
 * who came" is its one primary button (UX-VW-10). Each time has "Add to my calendar" (UX-VW-8).
 */
export function ViewingSheet({
  data,
  home,
  ahead,
  viewer,
  names,
  closeHref,
}: {
  data: ViewingSheetData;
  home: TimeHome;
  ahead: readonly AheadTime[];
  viewer: string;
  names: Record<string, string>;
  closeHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<'view' | 'change' | 'cancel'>('view');
  const [problem, setProblem] = useState('');
  const [cancelling, startCancelling] = useTransition();
  const close = () => router.replace(closeHref, { scroll: false });
  const people = data.booked === 1 ? '1 person' : `${data.booked} people`;

  const cancel = () =>
    startCancelling(async () => {
      const result = await cancelTimeAction(data.lettingId, data.sessionId);
      if (!result.ok) {
        setProblem(result.message);
        setMode('cancel');
        return;
      }
      toast.show({ message: result.message });
      close();
    });

  const changed = (done: NonNullable<TimeFormState['done']>) => {
    toast.show({ message: done.message });
    router.replace(`${closeHref.split('?')[0]}?day=${done.date}`, { scroll: false });
  };

  const title =
    mode === 'change' ? 'Change this time' : mode === 'cancel' ? 'Cancel this time?' : data.when;
  return (
    <Sheet
      open
      onClose={close}
      title={title}
      description={mode === 'view' ? data.address : `${data.address}, ${data.when}`}
    >
      {mode === 'view' ? (
        <div className={styles.sheet}>
          <div className={styles.counts}>
            <p className={styles.line}>
              {bookedLine({ booked: data.booked, places: data.places, waiting: 0 })} ·{' '}
              {placesLeftLine(data.places - data.booked - data.held)}
            </p>
            <p className={styles.muted}>
              {data.waiting === 0
                ? 'Nobody on the waiting list'
                : `${data.waiting} on the waiting list`}
            </p>
          </div>
          {data.people.length === 0 ? (
            <p className={styles.muted}>
              Nobody has booked yet. People you invite book themselves.
            </p>
          ) : (
            <ul className={styles.people} aria-label="Who’s booked">
              {data.people.map((person) => (
                <li key={person.bookingId} className={styles.person}>
                  <span className={styles.personTime}>{person.time}</span>
                  <span className={styles.personName}>{person.name}</span>
                  {person.status === 'attended' ? (
                    <StatusPill tone="success">Came</StatusPill>
                  ) : person.status === 'no_show' ? (
                    <StatusPill tone="neutral">Didn’t come</StatusPill>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className={styles.sheetActions}>
            {data.canMark ? (
              <ButtonLink href={data.markHref} variant="primary" fullWidth="phone">
                Mark who came
              </ButtonLink>
            ) : null}
            <a href={data.calendarFile} download {...buttonProps('secondary', 'phone')}>
              <CalendarPlus size={20} strokeWidth={1.75} aria-hidden="true" />
              Add to my calendar
            </a>
            {data.started ? null : (
              <Menu label={`More for ${data.when}`} align="end">
                <MenuItem icon={Pencil} onSelect={() => setMode('change')}>
                  Change
                </MenuItem>
                <MenuItem
                  icon={X}
                  destructive
                  onSelect={() => (data.booked > 0 ? setMode('cancel') : cancel())}
                >
                  Cancel this time
                </MenuItem>
              </Menu>
            )}
          </div>
          {problem ? (
            <Notice tone="warning" role="alert">
              <p>{problem}</p>
            </Notice>
          ) : null}
        </div>
      ) : mode === 'change' ? (
        <TimeForm
          homes={[home]}
          chosenHome={home.id}
          initial={data.settings}
          ahead={ahead}
          viewer={viewer}
          names={names}
          except={data.sessionId}
          moving={
            data.booked > 0 || data.held > 0
              ? { booked: data.booked, startsAt: data.startsAt, endsAt: data.endsAt }
              : undefined
          }
          action={changeTimeAction.bind(null, data.lettingId, data.sessionId)}
          submitLabel="Save"
          pendingLabel="Saving…"
          onDone={changed}
        />
      ) : (
        <div className={styles.sheet}>
          {problem ? (
            <Notice tone="warning" role="alert">
              <p>{problem}</p>
            </Notice>
          ) : data.otherTimes === 0 ? (
            <p>
              {people} {data.booked === 1 ? 'is' : 'are'} booked, and there’s no other time to offer
              them. Add another time first, then cancel this one.
            </p>
          ) : (
            <p>
              {people} {data.booked === 1 ? 'is' : 'are'} booked. Gaff emails{' '}
              {data.booked === 1 ? 'them' : 'each of them'} straight away with the other times, so
              they can book again. Their reminders for this time won’t go.
            </p>
          )}
          <div className={styles.sheetActions}>
            {data.otherTimes > 0 && !problem ? (
              <Button
                variant="destructive"
                fullWidth="phone"
                onClick={cancel}
                disabled={cancelling}
                aria-disabled={cancelling}
              >
                {cancelling ? 'Cancelling…' : 'Cancel this time'}
              </Button>
            ) : null}
            <Button
              variant={data.otherTimes > 0 && !problem ? 'quiet' : 'secondary'}
              fullWidth="phone"
              onClick={() => {
                setProblem('');
                setMode('view');
              }}
            >
              Keep it
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
