import { photoStore } from '@/adapters/photos';
import { isPhotoKey } from '@/domain/lettings/photos';

/**
 * UX-LT-10: a home's photo, served from Gaff's own address whichever store holds it, so the
 * page's content policy stays `'self'` and no visitor's request goes to a third party.
 *
 * Photos of homes only, and a home's photos are there to be shown: on the lister's screens now,
 * and on its public page (work package WP-20). So this asks for no sign-in. A photo is reached
 * only by its key, which is two random IDs and names no home and no person, and nothing lists
 * keys. A key never changes what it holds, so the answer can be kept for good.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const key = (await params).key.join('/');
  if (!isPhotoKey(key)) return new Response(null, { status: 404 });
  const photo = await photoStore().get(key);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      'content-type': photo.contentType,
      'content-length': String(photo.bytes.length),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
