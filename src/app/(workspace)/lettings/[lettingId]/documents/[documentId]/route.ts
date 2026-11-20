import { notFound } from 'next/navigation';
import { openSharedDocument } from '@/server/documents/letter';
import { loadLetting } from '../../letting';

export const dynamic = 'force-dynamic';

/**
 * BA-16 (P45, P53): a member of the letting's team opens a work document a chosen renter shared,
 * while it's kept. The membership is checked first (`loadLetting`, inside withOrg), the file is
 * decrypted on Gaff's server and streamed with no caching, and each opening is recorded. There
 * is no route for regular income at all: it has no file, and its kind is refused anyway.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lettingId: string; documentId: string }> },
): Promise<Response> {
  const { documentId } = await params;
  const { member, letting } = await loadLetting(params);
  const opened = await openSharedDocument(member, letting.id, documentId);
  if (!opened) notFound();
  return new Response(new Uint8Array(opened.bytes), {
    headers: {
      'content-type': opened.contentType,
      'content-disposition': 'inline',
      'cache-control': 'no-store, private',
      'x-content-type-options': 'nosniff',
    },
  });
}
