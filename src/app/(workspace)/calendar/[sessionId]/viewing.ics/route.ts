import { viewingTimeCalendarFile } from '@/domain/viewings/choosing';
import { requireMember } from '@/server/auth/member';
import { viewingDetail } from '@/server/viewings/calendar';

/**
 * UX-VW-8: "Add to my calendar" on a viewing time: a standard calendar file for the person who
 * runs it. It holds when, where and how many are booked: no renter's name or details, since a
 * calendar app keeps it outside Gaff. Two-way sync comes later.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const member = await requireMember();
  const { sessionId } = await params;
  const detail = await viewingDetail(member, sessionId);
  if (!detail) return new Response('Not found', { status: 404 });
  const file = viewingTimeCalendarFile({
    sessionId: detail.session.id,
    startsAt: detail.session.startsAt,
    endsAt: detail.session.endsAt,
    address: detail.letting.address,
    area: detail.letting.area,
    booked: detail.booked,
    places: detail.places,
  });
  return new Response(file, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="viewing.ics"',
      'Cache-Control': 'private, no-store',
    },
  });
}
