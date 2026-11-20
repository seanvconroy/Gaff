import { describe, expect, it, vi } from 'vitest';
import { supabaseDocumentStore } from './supabase';

function store(responses: Response[]) {
  const send = vi.fn(async () => responses.shift() ?? new Response(null, { status: 500 }));
  const documents = supabaseDocumentStore({
    url: 'https://made-up.supabase.co/',
    serviceKey: 'service-key',
    bucket: 'documents',
    fetch: send as unknown as typeof fetch,
  });
  return { documents, send };
}

describe('P53: the private documents bucket', () => {
  it('keeps a file in its own bucket with the server’s key, never cached', async () => {
    const { documents, send } = store([new Response('{}')]);
    await documents.put('documents/abc', {
      bytes: Buffer.from('sealed'),
      contentType: 'application/octet-stream',
    });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://made-up.supabase.co/storage/v1/object/documents/documents/abc');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer service-key',
      'cache-control': 'no-store',
    });
  });

  it('reads nothing for a key that isn’t there, and names no key when it fails', async () => {
    const { documents } = store([new Response(null, { status: 404 })]);
    expect(await documents.get('documents/missing')).toBeNull();
    const failing = store([new Response('documents/secret', { status: 500 })]).documents;
    await expect(failing.get('documents/secret')).rejects.toThrow(
      "The document store couldn't read the document (HTTP 500).",
    );
  });

  it('P36: signs one upload under uploads/, on the store’s own address', async () => {
    const { documents } = store([
      new Response(JSON.stringify({ url: '/object/upload/sign/documents/uploads/x?token=t' })),
    ]);
    expect(await documents.signedUpload!('uploads/x', 'application/pdf')).toEqual({
      url: 'https://made-up.supabase.co/storage/v1/object/upload/sign/documents/uploads/x?token=t',
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
    });
  });
});
