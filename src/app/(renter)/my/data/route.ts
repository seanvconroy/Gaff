import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { currentUser } from '@/server/auth/member';
import { myData } from '@/server/renters/account';

/** M13: everything Gaff holds about the renter, as a file they keep. Never cached. */
export async function GET() {
  if (!env().MARKETPLACE_PUBLIC) return new Response(null, { status: 404 });
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const data = await myData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="my-gaff-data.json"',
      'Cache-Control': 'no-store',
    },
  });
}
