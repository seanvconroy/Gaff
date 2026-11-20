import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { attendanceOpensAt, canMarkAttendance } from '@/domain/viewings/attendance';
import { leftToMarkLine } from '@/domain/viewings/calendar';
import { returnPath } from '@/domain/navigation/return-to';
import { env } from '@/lib/env';
import { formatDate, formatTime } from '@/lib/format';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { getLetting } from '@/server/lettings/queries';
import { attendanceFor } from '@/server/viewings/attendance';
import { ButtonLink } from '@/ui/Button';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Card, CardHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { markAction } from './actions';
import { AttendanceToggle } from './AttendanceToggle';
import styles from './attendance.module.css';
import { startViewingsNowAction } from './dev-actions';

export const metadata: Metadata = { title: 'Mark who came' };
export const dynamic = 'force-dynamic';

const ID = /^[0-9a-f-]{36}$/i;

/**
 * Mark who came (UX-VW-10, UX-VW-11, R15): a focused screen, with nothing else on it. Who's
 * booked, in time order, each with two large buttons, "Came" and "Didn't come", one tap each,
 * and a mark can be changed. One line at the top says how many are left. Opened from a viewing
 * time's sheet (for that time) and from Today (for the home). Each mark is a person's decision,
 * and decides who is asked to apply (R16).
 */
export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<{ problem?: string; viewing?: string; from?: string }>;
}) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!ID.test(lettingId)) notFound();
  const detail = await getLetting(member, lettingId);
  if (!detail) notFound();
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const { problem, viewing, from } = await searchParams;
  const sessionId = viewing && ID.test(viewing) ? viewing : undefined;
  const rows = await attendanceFor(member, lettingId, sessionId);
  const now = new Date();
  const leave = returnPath(from, '/calendar');
  const again = { viewing: sessionId, from: leave };
  const markable = rows.filter((row) => canMarkAttendance(row.startsAt, now));
  const left = markable.filter((row) => row.status === 'booked').length;
  const days = new Set(rows.map((row) => formatDate(row.startsAt, now)));
  const when = (at: Date) =>
    days.size > 1 ? `${formatDate(at, now)}, ${formatTime(at)}` : formatTime(at);

  return (
    <FlowShell
      leave={{ kind: 'close', href: leave }}
      primary={
        <ButtonLink href={leave} variant="primary" fullWidth="phone">
          Done
        </ButtonLink>
      }
    >
      <Stack gap={6}>
        <FlowTitle
          title={rows.length === 0 ? 'Nobody has booked yet' : 'Mark who came'}
          lead={
            rows.length === 0
              ? `${detail.letting.addressLine1}. People appear here as they book. On the day, you mark who came with one tap each.`
              : `${detail.letting.addressLine1}${days.size === 1 ? `, ${[...days][0]}` : ''}`
          }
        />
        {rows.length > 0 ? (
          <p className={styles.summary} role="status">
            {markable.length === 0
              ? `You can mark who came from ${formatTime(attendanceOpensAt(rows[0]!.startsAt))}.`
              : leftToMarkLine(left)}
          </p>
        ) : null}
        {problem ? (
          <Notice tone="warning" role="alert">
            <p>{problem}</p>
          </Notice>
        ) : null}
        {rows.length > 0 ? (
          <ul className={styles.list} aria-label="Who’s booked">
            {rows.map((row) => (
              <li key={row.bookingId} className={styles.row}>
                <div className={styles.who}>
                  <span className={styles.time}>{when(row.startsAt)}</span>
                  <span className={styles.name}>{row.name}</span>
                </div>
                {canMarkAttendance(row.startsAt, now) ? (
                  <div className={styles.choices} role="group" aria-label={`Did ${row.name} come?`}>
                    <form action={markAction.bind(null, lettingId, row.bookingId, true, again)}>
                      <AttendanceToggle came pressed={row.status === 'attended'} />
                    </form>
                    <form action={markAction.bind(null, lettingId, row.bookingId, false, again)}>
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
        ) : null}
        {env().DEV_TOOLS ? (
          <Card labelledBy="dev-heading" tone="quiet">
            <CardHeader
              id="dev-heading"
              title="Testing only"
              description="Move this letting’s viewings so they all finished a minute ago. Book times first, then use this to mark who came without waiting. This never appears in production."
            />
            <form action={startViewingsNowAction.bind(null, lettingId)}>
              <SubmitButton variant="secondary" pendingLabel="Moving…">
                Start the viewings now
              </SubmitButton>
            </form>
          </Card>
        ) : null}
      </Stack>
    </FlowShell>
  );
}
