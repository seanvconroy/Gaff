import type { NextRequest } from 'next/server';
import { countPageOpen } from '@/server/lettings/home-numbers';

export const dynamic = 'force-dynamic';

/**
 * M92: a home's page beacon. It adds one to the day's count of the page being opened, for the
 * lister's numbers. No cookies; the address and the browser are never stored, and a robot's
 * visit isn't counted. Only Gaff's own pages send it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response(null, { status: 204 });
  const { ref } = await params;
  await countPageOpen(ref, request.headers.get('user-agent'));
  return new Response(null, { status: 204 });
}
