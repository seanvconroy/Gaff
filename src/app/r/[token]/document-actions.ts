'use server';

import { formValues, invalid, type FormState } from '@/lib/forms';
import { renterDocumentsCopy } from '@/copy/documents';
import type { DocumentUploadTarget } from '@/ports/document-store';
import {
  correctDocument,
  finishDocumentUpload,
  removeDocument,
  shareChecks,
  startDocumentUpload,
} from '@/server/documents/renter';
import { loadRenterPage } from '@/server/renter/answers';
import { linkIsOpen } from '@/server/renter/gate';
import { personOnRenterPage } from '@/server/renter/person';
import { toRenterPage } from './back';

/**
 * BA-16 (P36 to P41): what a chosen renter does with their documents, from their own page.
 * Nothing here works from a link alone: the one-time code, or being signed in as the person
 * whose enquiry it is, opens it first (UX-RN-14). The person, if any, is who keeps documents.
 */
async function renter(token: string): Promise<{ userId: string | null } | null> {
  const page = await loadRenterPage(token);
  if (!page || !(await linkIsOpen(token, page.application.email))) return null;
  const person = await personOnRenterPage(token, page, { attach: true });
  return { userId: person?.userId ?? null };
}

export type UploadStart =
  | { via: 'server' }
  | { via: 'store'; uploadId: string; target: DocumentUploadTarget }
  | { via: 'none'; problem: string };

/** P36: where the browser sends a document: straight to the private bucket, or through Gaff. */
export async function startUploadAction(
  token: string,
  file: { contentType: string; bytes: number },
): Promise<UploadStart> {
  if (!(await renter(token))) return { via: 'none', problem: 'link' };
  return startDocumentUpload(token, {
    contentType: String(file.contentType).slice(0, 100),
    bytes: Number(file.bytes),
  });
}

/** P36: the browser sent it to the bucket: Gaff reads it, keeps it, deletes the original. */
export async function finishUploadAction(
  token: string,
  uploadId: string,
  kind: string,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  const who = await renter(token);
  if (!who) return { ok: false, problem: 'link' };
  const added = await finishDocumentUpload(token, who.userId, { uploadId, kind });
  return added.ok ? { ok: true } : { ok: false, problem: added.problem };
}

/** The renter takes a document off before sharing. */
export async function removeDocumentAction(token: string, documentId: string): Promise<void> {
  const who = await renter(token);
  if (who) await removeDocument(token, who.userId, documentId);
  toRenterPage(token);
}

/** P39, P5: the renter corrects what was read, or enters what a document says. */
export async function correctDocumentAction(
  token: string,
  documentId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const who = await renter(token);
  if (!who) toRenterPage(token);
  const corrected = await correctDocument(token, who.userId, documentId, values);
  if (!corrected.ok) {
    if ('closed' in corrected) toRenterPage(token);
    const problems = renterDocumentsCopy.change.problems;
    return invalid(
      Object.fromEntries(
        Object.entries(corrected.errors).map(([field, code]) => [field, problems[code] ?? code]),
      ),
      values,
    );
  }
  toRenterPage(token);
}

/** P39: everything shared in one step, with "Keep these for my next application" (P40). */
export async function shareAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const who = await renter(token);
  if (!who) toRenterPage(token);
  const shared = await shareChecks(token, who.userId, { keep: values.keep === 'yes' });
  if (!shared.ok && shared.problem === 'nothing') {
    return invalid({ form: renterDocumentsCopy.share.nothing }, values);
  }
  toRenterPage(token);
}
