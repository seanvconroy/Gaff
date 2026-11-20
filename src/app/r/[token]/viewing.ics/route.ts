import { viewingCalendarFile } from '@/domain/viewings/choosing';
import { loadRenterPage } from '@/server/renter/answers';

/**
 * UX-RN-8: "Add to my calendar". The renter's own viewing as a calendar file, which any phone's
 * calendar opens. It holds the time, the address and who lets the home: nothing about the
 * renter, and no link back to their page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await loadRenterPage(token);
  if (!page?.booking) return new Response('Not found', { status: 404 });
  const file = viewingCalendarFile({
    bookingId: page.booking.booking.id,
    startsAt: page.booking.slot.startsAt,
    endsAt: page.booking.slot.endsAt,
    address: page.letting.addressLine1,
    area: page.letting.area,
    listerName: page.organisation.name,
  });
  return new Response(file, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="viewing.ics"',
      'Cache-Control': 'private, no-store',
    },
  });
}
