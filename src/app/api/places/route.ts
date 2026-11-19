import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { popularWhere, suggestWhere, type WhereSuggestions } from '@/server/search/where';

export const dynamic = 'force-dynamic';

const query = z.string().trim().max(60).catch('');

/**
 * M56, M121, M124 (ADR-0017): place suggestions as a renter types under "Where", from Gaff's own
 * place index; with nothing typed, the places with the most homes on Gaff. The same answer for
 * everyone, with nothing about who asked, so the CDN may keep it for a few minutes. What was
 * typed goes nowhere else: no map or address provider sees it (rule 10), and it is never logged
 * (a place nobody found is counted, without digits, in `place_misses`).
 */
export async function GET(request: NextRequest) {
  const typed = query.parse(request.nextUrl.searchParams.get('q') ?? '');
  const body: WhereSuggestions = typed ? await suggestWhere(typed) : await popularWhere();
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' },
  });
}
