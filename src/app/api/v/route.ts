import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { recordMapCount } from '@/server/measurement/map-counts';
import { recordListingView } from '@/server/measurement/views';

/**
 * The beacon (tech spec, Measurement): a listing page counts one view, and the map counts its
 * uses (M133). No cookies, and the IP address and browser are never stored (see
 * recordListingView); the map's counts hold fixed codes and nothing else.
 */
export async function POST(request: NextRequest) {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response(null, { status: 204 });
  const params = request.nextUrl.searchParams;
  // M133: a use of the map, as a fixed code. Anything else in `m` or `k` is ignored.
  if (params.has('m')) {
    await recordMapCount(params.get('m'), params.get('k'), request.headers.get('user-agent'));
    return new Response(null, { status: 204 });
  }
  const listingId = z.uuid().safeParse(params.get('l'));
  if (!listingId.success) return new Response(null, { status: 204 });
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '';
  await recordListingView(listingId.data, { ip, userAgent: request.headers.get('user-agent') });
  return new Response(null, { status: 204 });
}
