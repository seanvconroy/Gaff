import type { Metadata } from 'next';
import {
  attendanceOpensAt,
  canMarkAttendance,
  summariseAttendance,
} from '@/domain/viewings/attendance';
import { formatDate, formatTime } from '@/lib/format';
import { attendanceFor } from '@/server/viewings/attendance';
import { CalendarCheck } from 'lucide-react';
import { EmptyState } from '@/ui/EmptyState';
import { Card, CardHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { loadLetting } from '../letting';
import { LettingHeader } from '../LettingHeader';
import { markAction } from './actions';
import { startViewingsNowAction } from './dev-actions';
import { env } from '@/lib/env';
import { SubmitButton } from '@/ui/SubmitButton';
import { AttendanceToggle } from './AttendanceToggle';
import styles from './attendance.module.css';

export const metadata: Metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

/** R15: on the day, on a phone: one tap per person to say whether they came. */
export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ problem?: string }>;
}) {
  const { member, letting } = await loadLetting(params);
  const rows = await attendanceFor(member, letting.id);
  const { problem } = await searchParams;
  const now = new Date();
  const summary = summariseAttendance(rows.map((row) => row.status));
  const days = [...new Set(rows.map((row) => formatDate(row.startsAt)))];
  return (
    <Stack gap={8}>
      <LettingHeader letting={letting} tab="attendance" />
      {problem ? (
        <Notice tone="warning" role="alert">
          <p>{problem}</p>
        </Notice>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Nobody has booked yet">
          <p>
            People appear here as soon as they book a viewing. On the day, you mark who came with
            one tap each.
          </p>
        </EmptyState>
      ) : (
        <Stack gap={6}>
          <Stack gap={1}>
            <p className={styles.summary}>
              {rows.length} booked · {summary.attended} came · {summary.noShow} didn’t come ·{' '}
              {summary.toMark} to mark
            </p>
            <p className={styles.hint}>
              Only people you mark as came are asked to apply. You can change a mark.
            </p>
          </Stack>
          {days.map((day, index) => (
            <section key={day} aria-labelledby={`day-${index}`} className={styles.day}>
              <h2 id={`day-${index}`} className={`${styles.dayHeading} type-title`}>
                {day}
              </h2>
              <ul className={styles.list}>
                {rows
                  .filter((row) => formatDate(row.startsAt) === day)
                  .map((row) => (
                    <li key={row.bookingId} className={styles.row}>
                      <div className={styles.who}>
                        <span className={styles.time}>{formatTime(row.startsAt)}</span>
                        <span className={styles.name}>{row.name}</span>
                      </div>
                      {canMarkAttendance(row.startsAt, now) ? (
                        <div
                          className={styles.choices}
                          role="group"
                          aria-label={`Did ${row.name} come?`}
                        >
                          <form action={markAction.bind(null, letting.id, row.bookingId, true)}>
                            <AttendanceToggle came pressed={row.status === 'attended'} />
                          </form>
                          <form action={markAction.bind(null, letting.id, row.bookingId, false)}>
                            <AttendanceToggle came={false} pressed={row.status === 'no_show'} />
                          </form>
                        </div>
                      ) : (
                        <p className={styles.opens}>
                          Mark from {formatTime(attendanceOpensAt(row.startsAt))}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </Stack>
      )}
      {env().DEV_TOOLS ? (
        <Card labelledBy="dev-heading" tone="quiet">
          <CardHeader
            id="dev-heading"
            title="Testing only"
            description="Move this letting’s viewings so they all finished a minute ago. Book times first, then use this to mark who came without waiting. This never appears in production."
          />
          <form action={startViewingsNowAction.bind(null, letting.id)}>
            <SubmitButton variant="secondary" pendingLabel="Moving…">
              Start the viewings now
            </SubmitButton>
          </form>
        </Card>
      ) : null}
    </Stack>
  );
}
