import { NextResponse, type NextRequest } from 'next/server';
import { isPublicRef } from '@/domain/homes/home-page';
import { mapCard } from '@/server/search/map';

export const dynamic = 'force-dynamic';

/**
 * M117: what a pin's mini card shows: the cover photo, the rent, the line and when it's free,
 * for a live home by its public reference. The same as its card in the list, and nothing more.
 */
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('id') ?? '';
  if (!isPublicRef(ref)) return new Response(null, { status: 400 });
  const card = await mapCard(ref);
  if (!card) return new Response(null, { status: 404 });
  return NextResponse.json(card, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
