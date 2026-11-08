import { objectStorage, servesDevStorage } from '@/adapters/storage';

const types: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg' };

/** Local stand-in for the public photos bucket (STORAGE_PROVIDER local or database). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  if (!servesDevStorage()) return new Response(null, { status: 404 });
  const key = (await params).key.join('/');
  let body: Buffer | null = null;
  try {
    body = await objectStorage().read('media', key);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (!body) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': types[key.split('.').pop() ?? ''] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
