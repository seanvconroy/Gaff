import { objectStorage, servesDevStorage } from '@/adapters/storage';
import { safeKey, verifyLocalUpload } from '@/adapters/storage/local';
import { MAX_UPLOAD_BYTES } from '@/domain/media/photos';
import { env } from '@/lib/env';

/** Local stand-in for Supabase Storage's signed uploads (STORAGE_PROVIDER local or database). */
export async function PUT(request: Request): Promise<Response> {
  const config = env();
  if (!servesDevStorage()) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const params = {
    key: url.searchParams.get('key') ?? '',
    contentType: url.searchParams.get('type') ?? '',
    expires: Number(url.searchParams.get('expires')),
    token: url.searchParams.get('token') ?? '',
  };
  if (!verifyLocalUpload(config.AUTH_SECRET, params)) {
    return new Response('This upload link has expired. Add the photo again.', { status: 403 });
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_UPLOAD_BYTES) return new Response(null, { status: 413 });
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_UPLOAD_BYTES) return new Response(null, { status: 413 });
  await objectStorage().write('uploads', safeKey(params.key), body, params.contentType);
  return new Response(null, { status: 200 });
}
