import { NextResponse } from 'next/server';
import { MAX_DOCUMENT_BYTES } from '@/domain/documents/files';
import { env } from '@/lib/env';
import { addDocument } from '@/server/documents/renter';
import { loadRenterPage } from '@/server/renter/answers';
import { linkIsOpen } from '@/server/renter/gate';
import { personOnRenterPage } from '@/server/renter/person';

export const dynamic = 'force-dynamic';

/**
 * BA-16 (P36): one document, sent through Gaff's own server where the document store can't sign
 * an upload (the local store: development and tests). With Supabase, the browser sends it
 * straight to the private bucket instead (`startUploadAction`). Not from a link alone: the
 * one-time code, or being signed in as the person whose enquiry it is, opens it (UX-RN-14).
 *
 * Asked by the page's script, it answers in JSON; a form sent without a script is taken back to
 * the page, with a code for what went wrong, and nothing personal in the address.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const wantsJson = request.headers.get('x-gaff-fetch') === '1';
  const answer = (problem: string | null) =>
    wantsJson
      ? NextResponse.json(problem ? { ok: false, problem } : { ok: true })
      : NextResponse.redirect(
          new URL(`/r/${token}${problem ? `?document_problem=${problem}` : ''}`, env().APP_URL),
          303,
        );
  // Only Gaff's own pages send here, as for a server action: never another site's form.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(env().APP_URL).origin) {
    return new NextResponse(null, { status: 403 });
  }
  const declared = Number(request.headers.get('content-length') ?? 0);
  // The form, the file and its boundary: a little over the file's own limit.
  if (declared > MAX_DOCUMENT_BYTES + 64 * 1024) return answer('too_big');
  const page = await loadRenterPage(token);
  if (!page || !(await linkIsOpen(token, page.application.email))) return answer('link');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return answer('failed');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return answer('empty');
  if (file.size > MAX_DOCUMENT_BYTES) return answer('too_big');
  const person = await personOnRenterPage(token, page, { attach: true });
  const added = await addDocument(token, person?.userId ?? null, {
    kind: String(form.get('kind') ?? ''),
    bytes: Buffer.from(await file.arrayBuffer()),
  });
  return answer(added.ok ? null : added.problem);
}
