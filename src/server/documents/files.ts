import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { documentStore } from '@/adapters/documents';
import {
  fileProblem,
  pdfPagesIn,
  sniffDocumentType,
  type DocumentType,
  type FileProblem,
} from '@/domain/documents/files';
import { openBytes, sealBytes } from '@/lib/crypto';
import type { DocumentStore } from '@/ports/document-store';

/**
 * P36, P53 (BA-16): a renter's document as Gaff keeps it. What it is is read from its bytes; a
 * PDF's pages are counted; a photo is made again from its pixels the right way up, so nothing
 * that says where, when or with what it was taken survives (as the photo pipeline does,
 * ADR-0023). It is then encrypted with Gaff's own key and kept under a key that names nobody.
 * This is the only code that uses the document store.
 */
export interface PreparedDocument {
  type: DocumentType;
  pages: number;
  /** The file as it is read and kept: a PDF as sent, a photo upright with no metadata. */
  bytes: Buffer;
}

/** A PDF's text, with each compressed stream inflated, so pages in object streams count. */
function pdfText(bytes: Buffer): string {
  const raw = bytes.toString('latin1');
  const parts = [raw];
  for (const found of raw.matchAll(/\/FlateDecode[^]*?stream\r?\n/g)) {
    const start = (found.index ?? 0) + found[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      parts.push(inflateSync(bytes.subarray(start, end)).toString('latin1'));
    } catch {
      // A stream that isn't deflated (or is damaged) holds no page objects we can count.
    }
  }
  return parts.join('\n');
}

const reading = { limitInputPixels: 80_000_000, failOn: 'error' as const };

export async function prepareDocument(
  input: Buffer,
): Promise<{ ok: true; document: PreparedDocument } | { ok: false; problem: FileProblem }> {
  const type = sniffDocumentType(input);
  const pages = type === 'application/pdf' ? pdfPagesIn(pdfText(input)) : type ? 1 : 0;
  const problem = fileProblem({ bytes: input.length, type, pages });
  if (problem || !type) return { ok: false, problem: problem ?? 'not_a_document' };
  if (type === 'application/pdf') return { ok: true, document: { type, pages, bytes: input } };
  try {
    const upright = sharp(input, reading).rotate();
    const bytes =
      type === 'image/png'
        ? await upright.png().toBuffer()
        : await upright.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return { ok: true, document: { type, pages: 1, bytes } };
  } catch {
    return { ok: false, problem: 'not_a_document' };
  }
}

/** Encrypts the file and keeps it under a new key. Returns the key. */
export async function keepFile(
  document: { bytes: Buffer; type: string },
  store: DocumentStore = documentStore(),
): Promise<string> {
  const key = `documents/${crypto.randomUUID()}`;
  await store.put(key, {
    bytes: sealBytes(document.bytes),
    contentType: 'application/octet-stream',
  });
  return key;
}

/** The file under this key, decrypted, or null if it's gone. */
export async function readFile(
  key: string,
  store: DocumentStore = documentStore(),
): Promise<Buffer | null> {
  const found = await store.get(key);
  return found ? openBytes(found.bytes) : null;
}

/** P41: a second, separate object for the letter, so deleting one never touches the other. */
export async function copyFile(
  key: string,
  store: DocumentStore = documentStore(),
): Promise<string | null> {
  const found = await store.get(key);
  if (!found) return null;
  const copy = `documents/${crypto.randomUUID()}`;
  await store.put(copy, found);
  return copy;
}

export async function dropFiles(
  keys: ReadonlyArray<string | null>,
  store: DocumentStore = documentStore(),
): Promise<void> {
  const present = keys.filter((key): key is string => key !== null);
  if (present.length > 0) await store.remove(present);
}

/** P36: where the browser sends a 10 MB document itself, where the store can sign one. */
export function uploadKey(uploadId: string): string {
  return `uploads/${uploadId}`;
}
