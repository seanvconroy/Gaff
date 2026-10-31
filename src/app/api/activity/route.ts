import { z } from 'zod';
import { env } from '@/lib/env';
import { currentUser, findMember } from '@/server/auth/member';
import { recordActiveMinute } from '@/server/dashboard/activity';

const heartbeat = z.object({ lettingId: z.uuid().nullable() });

/** R28, Q15: the workspace says, once a minute, that someone is using it. Nothing else. */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(env().APP_URL).origin) {
    return new Response(null, { status: 403 });
  }
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const member = await findMember(user.id);
  if (!member) return new Response(null, { status: 403 });
  const parsed = heartbeat.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  await recordActiveMinute(member, parsed.data.lettingId);
  return new Response(null, { status: 204 });
}
