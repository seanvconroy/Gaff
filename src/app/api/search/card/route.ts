import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { photoSources } from '@/app/(public)/photos';
import { roomsLine } from '@/app/(public)/facts';
import { formatRent } from '@/lib/format';
import { env } from '@/lib/env';
import { mapCard } from '@/server/search/search';

/** M117: what a pin's mini card shows: the first photo, the title, the rent and the rooms. */
export async function GET(request: NextRequest) {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get('id'));
  if (!id.success) return new Response(null, { status: 400 });
  const card = await mapCard(id.data);
  if (!card) return new Response(null, { status: 404 });
  const photo = card.photos.find((p) => p.kind === 'photo');
  return NextResponse.json(
    {
      id: card.listingId,
      href: `/home/${card.slug}`,
      title: card.title,
      rent: formatRent(card.rentCents),
      rooms: roomsLine(card),
      photo: photo ? photoSources(photo, `Photo of ${card.title}`) : null,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}
