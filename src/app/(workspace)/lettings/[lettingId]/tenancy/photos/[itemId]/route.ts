import { currentUser, findMember } from '@/server/auth/member';
import { photoForOperator } from '@/server/tenancy/movein';

/** R25: an inventory photo, for the operator. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lettingId: string; itemId: string }> },
): Promise<Response> {
  const { lettingId, itemId } = await params;
  const user = await currentUser();
  const member = user ? await findMember(user.id) : null;
  if (!member) return new Response(null, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(lettingId) || !/^[0-9a-f-]{36}$/i.test(itemId)) {
    return new Response(null, { status: 404 });
  }
  const photo = await photoForOperator(member, lettingId, itemId);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: { 'content-type': photo.type, 'cache-control': 'private, no-store' },
  });
}
