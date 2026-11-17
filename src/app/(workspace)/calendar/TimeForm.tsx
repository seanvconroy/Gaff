'use client';

import { User, Users } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { clashes, movedTo, newTimeLine, type TimeSettings } from '@/domain/viewings/calendar';
import { MAX_GROUP_CAPACITY, slotLengths } from '@/domain/viewings/viewing-session';
import { formatTimeRange, irishInstant, irishToday } from '@/lib/format';
import { ChoiceCards } from '@/ui/ChoiceCards';
import { SelectField } from '@/ui/Field';
import { Columns, FormActions, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { DateField, TimeField } from '@/ui/Pickers';
import { SubmitButton } from '@/ui/SubmitButton';
import type { TimeFormState } from './actions';
import styles from './calendar.module.css';

/** A home the sheet can add a time to, with what its sheet opens with (UX-VW-3). */
export interface TimeHome {
  id: string;
  address: string;
  leadUserId: string | null;
  defaults: TimeSettings & { date: string };
}

/** A viewing time still to come, for the overlap warning (UX-VW-7). Instants as ISO strings. */
export interface AheadTime {
  sessionId: string;
  lettingId: string;
  address: string;
  leadUserId: string | null;
  startsAt: string;
  endsAt: string;
}

const groupSizes = Array.from({ length: MAX_GROUP_CAPACITY - 1 }, (_, i) => i + 2);

/**
 * The fields of a viewing time (UX-VW-3): the home (only when there's a choice), the day, from
 * and until, how people view, and the length of each visit or the most people at once. At most
 * five, each with a default, so the common case is: pick a day, press Add. A line under the
 * fields says what it makes. Times are chosen from a list in Irish format (UX-VW-9).
 *
 * `moving`: people are booked, so only the day and the start change and the rest stays (UX-VW-6).
 */
export function TimeForm({
  homes,
  chosenHome,
  initial,
  ahead,
  viewer,
  names,
  action,
  submitLabel,
  pendingLabel,
  except,
  moving,
  onDone,
}: {
  homes: readonly TimeHome[];
  /** The home it's for; with more than one home and none given, the person picks. */
  chosenHome?: string;
  initial?: TimeSettings & { date: string };
  ahead: readonly AheadTime[];
  viewer: string;
  names: Record<string, string>;
  action: (state: TimeFormState, formData: FormData) => Promise<TimeFormState>;
  submitLabel: string;
  pendingLabel: string;
  /** The viewing time being changed, which can't clash with itself. */
  except?: string;
  moving?: { booked: number; startsAt: string; endsAt: string };
  onDone: (done: NonNullable<TimeFormState['done']>) => void;
}) {
  const [state, formAction] = useActionState(action, {} as TimeFormState);
  const [homeId, setHomeId] = useState(chosenHome ?? homes[0]?.id ?? '');
  const home = homes.find((h) => h.id === homeId);
  const start = initial ?? home?.defaults;
  const [values, setValues] = useState(() => ({ ...start! }));
  const v = state.values;
  const e = state.errors ?? {};

  useEffect(() => {
    if (state.done) onDone(state.done);
    // Only a new answer from the server counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const set = (patch: Partial<typeof values>) => setValues((now) => ({ ...now, ...patch }));
  const chooseHome = (id: string) => {
    setHomeId(id);
    const next = homes.find((h) => h.id === id);
    if (next && !initial) setValues({ ...next.defaults });
  };

  // With people booked, the length stays: the end follows the start.
  const shown = moving
    ? (() => {
        const to = movedTo(
          { startsAt: new Date(moving.startsAt), endsAt: new Date(moving.endsAt) },
          values.start,
        );
        return { ...values, end: to?.end ?? values.end };
      })()
    : values;

  // UX-VW-7: another viewing the same person leads, at the same time. A warning, never a block.
  const lead = home?.leadUserId ?? null;
  const overlap =
    lead && shown.end > shown.start
      ? clashes(
          {
            startsAt: irishInstant(shown.date, shown.start),
            endsAt: irishInstant(shown.date, shown.end),
          },
          ahead
            .filter(
              (t) => t.leadUserId === lead && t.lettingId !== homeId && t.sessionId !== except,
            )
            .map((t) => ({ ...t, startsAt: new Date(t.startsAt), endsAt: new Date(t.endsAt) })),
        )[0]
      : undefined;
  const who = lead === viewer ? 'You have' : `${names[lead ?? ''] ?? 'The home’s lead'} has`;

  return (
    <form key={state.attempt ?? 'first'} action={formAction} className={formClass} noValidate>
      {e.form ? (
        <Notice tone="warning" role="alert">
          <p>{e.form}</p>
        </Notice>
      ) : null}
      {homes.length > 1 && !chosenHome ? (
        <SelectField
          name="home"
          label="Home"
          defaultValue={v?.home ?? homeId}
          error={e.home}
          onChange={(event) => chooseHome(event.target.value)}
          options={homes.map((h) => ({ value: h.id, label: h.address }))}
        />
      ) : (
        <input type="hidden" name="home" value={homeId} />
      )}
      <DateField
        name="date"
        label="Day"
        title="Choose the day"
        min={irishToday()}
        value={shown.date}
        onChange={(date) => set({ date })}
        error={e.date}
      />
      <Columns>
        <TimeField
          name="start"
          label="From"
          title="Starts at"
          from="08:00"
          until="20:45"
          stepMinutes={15}
          value={shown.start}
          onChange={(time) => set({ start: time })}
          error={e.start}
        />
        {moving ? (
          <input type="hidden" name="end" value={shown.end} />
        ) : (
          <TimeField
            name="end"
            label="Until"
            title="Ends at"
            from="08:15"
            until="21:00"
            stepMinutes={15}
            value={shown.end}
            onChange={(time) => set({ end: time })}
            error={e.end}
          />
        )}
      </Columns>
      {overlap ? (
        <Notice tone="warning" role="status">
          <p>
            {who} a viewing at {overlap.address} then,{' '}
            {formatTimeRange(overlap.startsAt, overlap.endsAt)}. You can still add this one.
          </p>
        </Notice>
      ) : null}
      {moving ? (
        <>
          <input type="hidden" name="kind" value={shown.kind} />
          <input type="hidden" name="slotMinutes" value={shown.slotMinutes} />
          <input type="hidden" name="capacity" value={shown.capacity} />
        </>
      ) : (
        <>
          <ChoiceCards
            name="kind"
            legend="How people view"
            defaultValue={shown.kind}
            error={e.kind}
            onChange={(event) => set({ kind: event.target.value as TimeSettings['kind'] })}
            options={[
              {
                value: 'slots',
                label: 'One at a time',
                help: 'Each person books their own visit.',
                icon: User,
              },
              {
                value: 'group',
                label: 'Open viewing',
                help: 'Several people at once, up to a limit.',
                icon: Users,
              },
            ]}
          />
          {shown.kind === 'slots' ? (
            <>
              <SelectField
                name="slotMinutes"
                label="Length of each visit"
                width="medium"
                value={String(shown.slotMinutes)}
                onChange={(event) => set({ slotMinutes: Number(event.target.value) })}
                error={e.slotMinutes}
                options={slotLengths.map((minutes) => ({
                  value: String(minutes),
                  label: `${minutes} minutes`,
                }))}
              />
              <input type="hidden" name="capacity" value={shown.capacity} />
            </>
          ) : (
            <>
              <SelectField
                name="capacity"
                label="Most people at once"
                width="medium"
                value={String(shown.capacity)}
                onChange={(event) => set({ capacity: Number(event.target.value) })}
                error={e.capacity}
                options={groupSizes.map((n) => ({ value: String(n), label: `${n} people` }))}
              />
              <input type="hidden" name="slotMinutes" value={shown.slotMinutes} />
            </>
          )}
        </>
      )}
      <p className={styles.line} aria-live="polite">
        {newTimeLine(shown)}
      </p>
      {moving ? (
        <p className={styles.muted}>
          {moving.booked} {moving.booked === 1 ? 'person is' : 'people are'} booked, so the length
          stays the same. Gaff tells them the new time straight away.
        </p>
      ) : null}
      <FormActions>
        <SubmitButton fullWidth="phone" pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </FormActions>
    </form>
  );
}
