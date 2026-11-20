import type { NextRequest } from 'next/server';
import { recordMapCount } from '@/server/search/map-counts';

export const dynamic = 'force-dynamic';

/**
 * M133: the search map's beacon. It counts one use as a fixed code (`m`, and `k` for its kind);
 * anything else is ignored. No cookies; the address and the browser are never stored, and a
 * robot's visit isn't counted. Only Gaff's own pages send it.
 */
export async function POST(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response(null, { status: 204 });
  const params = request.nextUrl.searchParams;
  await recordMapCount(params.get('m'), params.get('k'), request.headers.get('user-agent'));
  return new Response(null, { status: 204 });
}
