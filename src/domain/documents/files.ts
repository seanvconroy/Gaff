/**
 * P36: a document is a PDF, a JPG or a PNG, up to 10 MB and 10 pages, from the phone's files or
 * its camera. What it is is read from its bytes, never its name or what the browser says.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 10;

export const documentTypes = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type DocumentType = (typeof documentTypes)[number];

/** What these bytes are, by their signature. Anything else is not a document Gaff takes. */
export function sniffDocumentType(bytes: Uint8Array): DocumentType | null {
  const at = (i: number) => bytes[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => at(i) === b)) return 'image/png';
  // "%PDF-" within the first kilobyte, as PDF readers allow.
  const head = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 1024)));
  if (head.includes('%PDF-')) return 'application/pdf';
  return null;
}

/**
 * How many pages a PDF has, from its text: the page objects it declares, or the largest page
 * count its page tree gives, whichever is more. `text` is the file read as Latin-1, with any
 * compressed object streams inflated and added (src/server/documents/files.ts), so pages kept
 * in them are counted too. Zero means it couldn't tell: Gaff then treats it as unreadable.
 */
export function pdfPagesIn(text: string): number {
  const pageObjects = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  let tree = 0;
  for (const found of text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)) {
    tree = Math.max(tree, Number(found[1]));
  }
  for (const found of text.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)) {
    tree = Math.max(tree, Number(found[1]));
  }
  return Math.max(pageObjects, tree);
}

export type FileProblem = 'not_a_document' | 'too_big' | 'too_many_pages' | 'empty';

/** P36: whether Gaff takes this file, and if not, why, in a code the page turns into words. */
export function fileProblem(file: {
  bytes: number;
  type: DocumentType | null;
  pages: number;
}): FileProblem | null {
  if (file.bytes === 0) return 'empty';
  if (file.bytes > MAX_DOCUMENT_BYTES) return 'too_big';
  if (!file.type) return 'not_a_document';
  if (file.type === 'application/pdf' && (file.pages === 0 || file.pages > MAX_DOCUMENT_PAGES)) {
    return file.pages === 0 ? 'not_a_document' : 'too_many_pages';
  }
  return null;
}
