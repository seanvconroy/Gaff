import { describe, expect, it } from 'vitest';
import { supabasePhotoStore } from './supabase';

const key = 'homes/0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11/7d6a3f0e-51c2-4c59-8d0f-3f3a1b2c4d5e.jpg';

/** A stand-in for the network: it records what was asked and answers as it's told to. */
function storeWith(answer: (url: string, init?: RequestInit) => Response) {
  const asked: Array<{ url: string; init?: RequestInit }> = [];
  const store = supabasePhotoStore({
    url: 'https://example-ref.supabase.co/',
    serviceKey: 'made-up-service-key',
    bucket: 'homes',
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      asked.push({ url: String(url), init });
      return answer(String(url), init);
    }) as typeof fetch,
  });
  return { store, asked };
}

describe('UX-LT-10: homes’ photos in Supabase Storage', () => {
  it('keeps a photo in the private bucket, with the service key, by its key alone', async () => {
    const { store, asked } = storeWith(() => new Response('{}', { status: 200 }));
    await store.put(key, { bytes: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.url).toBe(`https://example-ref.supabase.co/storage/v1/object/homes/${key}`);
    expect(asked[0]!.init?.method).toBe('POST');
    expect(asked[0]!.init?.headers).toMatchObject({
      authorization: 'Bearer made-up-service-key',
      'content-type': 'image/jpeg',
      'x-upsert': 'true',
    });
  });

  it('reads a photo back, and a photo that isn’t there is null, not an error', async () => {
    const found = storeWith(
      () => new Response(new Uint8Array([9, 8, 7]), { headers: { 'content-type': 'image/png' } }),
    );
    expect(await found.store.get(key)).toEqual({
      bytes: Buffer.from([9, 8, 7]),
      contentType: 'image/png',
    });
    const missing = storeWith(() => new Response('{}', { status: 404 }));
    expect(await missing.store.get(key)).toBeNull();
  });

  it('copies and removes by key', async () => {
    const { store, asked } = storeWith(() => new Response('{}', { status: 200 }));
    await store.copy(key, key.replace('7d6a', '8e7b'));
    await store.remove([key]);
    await store.remove([]);
    expect(asked.map((each) => [each.init?.method, each.url.replace(/^.*\/object/, '')])).toEqual([
      ['POST', '/copy'],
      ['DELETE', '/homes'],
    ]);
    expect(JSON.parse(String(asked[0]!.init?.body))).toEqual({
      bucketId: 'homes',
      sourceKey: key,
      destinationKey: key.replace('7d6a', '8e7b'),
    });
    expect(JSON.parse(String(asked[1]!.init?.body))).toEqual({ prefixes: [key] });
  });

  it('rule 8: a failure says the status only, never the key or what the store answered', async () => {
    const { store } = storeWith(() => new Response(`no such object ${key}`, { status: 500 }));
    const failure = await store
      .put(key, { bytes: Buffer.from([1]), contentType: 'image/jpeg' })
      .catch((error: Error) => error.message);
    expect(failure).toBe("The photo store couldn't keep the photo (HTTP 500).");
    expect(failure).not.toContain(key);
    expect(failure).not.toContain('made-up-service-key');
  });

  it('M43: signs one upload, under uploads/, and gives the browser the address and the type', async () => {
    const upload =
      'uploads/0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11.7d6a3f0e-51c2-4c59-8d0f-3f3a1b2c4d5e';
    const { store, asked } = storeWith(
      () =>
        new Response(
          JSON.stringify({ url: `/object/upload/sign/homes/${upload}?token=made-up-token` }),
          { status: 200 },
        ),
    );
    const target = await store.signedUpload!(upload, 'image/jpeg');
    expect(asked[0]!.url).toBe(
      `https://example-ref.supabase.co/storage/v1/object/upload/sign/homes/${upload}`,
    );
    expect(asked[0]!.init?.method).toBe('POST');
    expect(target).toEqual({
      url: `https://example-ref.supabase.co/storage/v1/object/upload/sign/homes/${upload}?token=made-up-token`,
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
    });
    // The service key never goes to the browser.
    expect(JSON.stringify(target)).not.toContain('made-up-service-key');
    const refused = storeWith(() => new Response('{}', { status: 200 }));
    await expect(refused.store.signedUpload!(upload, 'image/jpeg')).rejects.toThrow(
      /didn't give an upload address/,
    );
  });

  it('M43: deletes originals that were sent and never finished, and leaves newer ones', async () => {
    const before = new Date('2026-11-18T02:30:00Z');
    const { store, asked } = storeWith((url) =>
      url.includes('/list/')
        ? new Response(
            JSON.stringify([
              { name: 'a.b', created_at: '2026-11-16T10:00:00Z' },
              { name: 'c.d', created_at: '2026-11-17T10:00:00Z' },
              { name: 'e.f', created_at: '2026-11-18T10:00:00Z' },
            ]),
          )
        : new Response('{}', { status: 200 }),
    );
    expect(await store.removeUploadsBefore!(before)).toBe(2);
    expect(JSON.parse(String(asked[0]!.init?.body))).toMatchObject({ prefix: 'uploads' });
    expect(asked[1]!.init?.method).toBe('DELETE');
    expect(JSON.parse(String(asked[1]!.init?.body))).toEqual({
      prefixes: ['uploads/a.b', 'uploads/c.d'],
    });
    expect(asked).toHaveLength(2);
  });
});
