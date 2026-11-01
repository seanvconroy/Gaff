import { photoForTenant } from '@/server/tenancy/movein';

/** R25: an inventory photo, for the tenant, once the inventory is shared with them. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; itemId: string }> },
): Promise<Response> {
  const { token, itemId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return new Response(null, { status: 404 });
  const photo = await photoForTenant(token, itemId);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: { 'content-type': photo.type, 'cache-control': 'private, no-store' },
  });
}
