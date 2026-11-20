'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { renterDocumentsCopy } from '@/copy/documents';
import { MAX_DOCUMENT_BYTES } from '@/domain/documents/files';
import type { DocumentKind } from '@/domain/documents/kinds';
import { Button } from '@/ui/Button';
import { SelectField, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { finishUploadAction, startUploadAction } from './document-actions';

const copy = renterDocumentsCopy;

/**
 * BA-16 (P36): adding one document: what kind it is, then the file, from the phone's files or
 * its camera. Where the private bucket can sign an upload, the browser sends the file straight
 * there; otherwise it goes through Gaff's own route. Either way Gaff reads it by its bytes, and
 * the page shows what was read, at once. Errors are said at the field. Without a script, the
 * form still sends, through the route, and comes back to the page.
 */
export function DocumentUpload({
  token,
  kinds,
  primary,
}: {
  token: string;
  kinds: readonly DocumentKind[];
  /** The view's one primary button, while nothing is added yet. */
  primary: boolean;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ field: 'file' | 'kind'; message: string } | null>(null);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    const kind = String(data.get('kind') ?? '');
    if (!(file instanceof File) || file.size === 0) {
      setError({ field: 'file', message: copy.problems.empty! });
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError({ field: 'file', message: copy.problems.too_big! });
      return;
    }
    setError(null);
    setSending(true);
    try {
      const problem = await upload(file, kind, data);
      if (problem) {
        setError({
          field: problem === 'kind' ? 'kind' : 'file',
          message: copy.problems[problem] ?? copy.problems.failed!,
        });
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError({ field: 'file', message: copy.problems.failed! });
    } finally {
      setSending(false);
    }
  }

  async function upload(file: File, kind: string, data: FormData): Promise<string | null> {
    const started = await startUploadAction(token, { contentType: file.type, bytes: file.size });
    if (started.via === 'none') return started.problem;
    if (started.via === 'store') {
      const sent = await fetch(started.target.url, {
        method: started.target.method,
        headers: started.target.headers,
        body: file,
      });
      if (!sent.ok) return 'failed';
      const finished = await finishUploadAction(token, started.uploadId, kind);
      return finished.ok ? null : finished.problem;
    }
    const answer = await fetch(`/r/${token}/documents`, {
      method: 'POST',
      headers: { 'x-gaff-fetch': '1' },
      body: data,
    });
    if (!answer.ok) return 'failed';
    const result = (await answer.json()) as { ok: boolean; problem?: string };
    return result.ok ? null : (result.problem ?? 'failed');
  }

  return (
    <form
      action={`/r/${token}/documents`}
      method="post"
      encType="multipart/form-data"
      onSubmit={(event) => void send(event)}
      noValidate
    >
      <Stack gap={4}>
        <SelectField
          name="kind"
          label={copy.kindLabel}
          options={kinds.map((kind) => ({ value: kind, label: copy.kind(kind) }))}
          error={error?.field === 'kind' ? error.message : undefined}
        />
        <TextField
          name="file"
          label={copy.fileLabel}
          hint={`${copy.fileHint} ${copy.pps}`}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          error={error?.field === 'file' ? error.message : undefined}
        />
        <div>
          <Button
            type="submit"
            variant={primary ? 'primary' : 'secondary'}
            fullWidth="phone"
            disabled={sending}
            aria-busy={sending || undefined}
          >
            {sending ? copy.adding : primary ? copy.add : copy.another}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
