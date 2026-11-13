import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { recordListingView } from '@/server/measurement/views';

/**
 * The view beacon (tech spec, Measurement): a listing page counts one view. No cookies, and the
 * IP address and browser are never stored (see recordListingView).
 */
export async function POST(request: NextRequest) {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const listingId = z.uuid().safeParse(request.nextUrl.searchParams.get('l'));
  const site = request.headers.get('sec-fetch-site');
  if (!listingId.success || (site && site !== 'same-origin')) {
    return new Response(null, { status: 204 });
  }
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '';
  await recordListingView(listingId.data, { ip, userAgent: request.headers.get('user-agent') });
  return new Response(null, { status: 204 });
}
