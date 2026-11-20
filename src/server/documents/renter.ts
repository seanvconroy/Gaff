import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { documentStore } from '@/adapters/documents';
import { scopeToApplicant, scopeToPerson, withOrg, type Tx } from '@/db/client';
import { applications, checkDocuments, checks, renterDocuments } from '@/db/schema';
import { MAX_DOCUMENT_BYTES, documentTypes, type FileProblem } from '@/domain/documents/files';
import { flagsFor, newestPayslipDate, type DocumentFlag } from '@/domain/documents/flags';
import {
  keptUntil,
  letterCopyDeleteAfter,
  mayKeep,
  unsharedDeleteAfter,
} from '@/domain/documents/keeping';
import { documentKinds, letterKindOf, type DocumentKind } from '@/domain/documents/kinds';
import { correctedReading, type CorrectionValues } from '@/domain/documents/correction';
import { emptyReading, type DocumentReading } from '@/domain/documents/reading';
import {
  MAX_DOCUMENTS_PER_CHECK,
  askAnswered,
  documentAskFor,
  kindsFor,
  type DocumentAsk,
} from '@/domain/documents/requests';
import { openJson, sealJson } from '@/lib/crypto';
import { irishToday } from '@/lib/format';
import type { DocumentStore, DocumentUploadTarget } from '@/ports/document-store';
import type { AiProvider } from '@/ports/ai';
import { resolveAccessLink } from '@/server/access/links';
import { aiTaskIsOffered } from '@/server/ai/usage';
import { askNamedReferees, noteCheckProgress } from '@/server/checks/checks';
import { recordEvent } from '@/server/record/events';
import { copyFile, dropFiles, keepFile, prepareDocument, readFile, uploadKey } from './files';
import { readDocument } from './read';

/**
 * BA-16 (P30 to P41): a chosen renter's work and income documents, from their own private link.
 * The only code that opens the renter's own documents (`scopeToApplicant`), always in the
 * renter's own request, in the same transaction as the letting's record of it (rule 8), and
 * only for the preferred applicant or the backup, before they've shared (rule 2: never before
 * an applicant is chosen).
 *
 * Callers check the link is open (the one-time code, UX-RN-14) before calling any of these.
 */
const CHOSEN = ['preferred', 'backup'] as const;

type Link = { organisationId: string; subjectId: string };

/** The renter's own request: their application's organisation, and their own documents. */
async function onRenterLink<T>(
  link: Link,
  userId: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withOrg(link.organisationId, async (tx) => {
    await scopeToApplicant(tx, link.subjectId);
    if (userId) await scopeToPerson(tx, userId);
    return fn(tx);
  });
}

interface Situation {
  link: Link;
  application: typeof applications.$inferSelect;
  income: typeof checks.$inferSelect;
  /** The name a document should be in: the verified name, or the application's (P38). */
  matchName: string;
  /** Their ID check for this application, once it has passed: the name and the date. */
  verified: { name: string; at: Date } | null;
  ask: DocumentAsk;
}

async function situation(tx: Tx, link: Link): Promise<Situation | null> {
  const [application] = await tx
    .select()
    .from(applications)
    .where(eq(applications.id, link.subjectId));
  if (!application || !(CHOSEN as readonly string[]).includes(application.status)) return null;
  if (application.personalDataDeletedAt) return null;
  const own = await tx.select().from(checks).where(eq(checks.applicationId, application.id));
  const income = own.find((c) => c.kind === 'income');
  if (!income) return null;
  const identity = own.find((c) => c.kind === 'identity');
  const result =
    identity?.status === 'passed' && identity.resultSealed
      ? openJson<{ verifiedName?: string; verifiedAt?: string }>(identity.resultSealed)
      : null;
  const verified = result?.verifiedName
    ? {
        name: result.verifiedName,
        at: new Date(result.verifiedAt ?? identity?.completedAt ?? Date.now()),
      }
    : null;
  return {
    link,
    application,
    income,
    matchName: verified?.name ?? application.fullName,
    verified,
    ask: documentAskFor(application.earning),
  };
}

/** The renter's documents for this application, and those they keep on their profile. */
async function ownDocuments(tx: Tx, applicationId: string, userId: string | null) {
  return tx
    .select()
    .from(renterDocuments)
    .where(
      and(
        isNull(renterDocuments.deletedAt),
        userId
          ? or(eq(renterDocuments.applicationId, applicationId), eq(renterDocuments.userId, userId))
          : eq(renterDocuments.applicationId, applicationId),
      ),
    )
    .orderBy(renterDocuments.createdAt);
}

type Row = typeof renterDocuments.$inferSelect;

function readingOf(row: Row): DocumentReading {
  return row.readingSealed ? openJson<DocumentReading>(row.readingSealed) : emptyReading(row.kind);
}

/** P38: each document's flags, against the name to match and the newest payslip. */
function flagged(rows: Row[], context: Situation, today: string): Map<string, DocumentFlag[]> {
  const readings = rows.map((row) => ({ row, reading: readingOf(row) }));
  const newest = newestPayslipDate(
    readings
      .filter(({ row }) => row.readBy !== 'nobody')
      .map(({ reading }) => ({ kind: reading.kind, date: reading.date })),
  );
  const asked = kindsFor(context.ask);
  return new Map(
    readings.map(({ row, reading }) => [
      row.id,
      flagsFor(row.readBy === 'nobody' ? null : reading, {
        said: row.kind,
        asked,
        name: context.matchName,
        today,
        newestPayslip: newest,
      }),
    ]),
  );
}

export interface RenterDocument {
  id: string;
  kind: DocumentKind;
  reading: DocumentReading;
  readBy: 'gaff' | 'renter' | 'nobody';
  flags: DocumentFlag[];
  correctedByRenter: boolean;
  /** Kept on their profile from an earlier application (P40). */
  fromProfile: boolean;
  /** Whether there is still a file (a statement of other income has none once confirmed). */
  hasFile: boolean;
}

export interface DocumentsPage {
  ask: DocumentAsk;
  kinds: DocumentKind[];
  documents: RenterDocument[];
  /** What's uploaded answers the ask (it never blocks sharing, P38). */
  answered: boolean;
  /** P55: room for another upload. */
  canAdd: boolean;
  /** P5: whether Gaff can read documents just now (the task is on, the budget not spent). */
  readerOn: boolean;
  /** The name documents are checked against. */
  matchName: string;
  /** P39: their ID check, which the letter already has, as the share screen says it. */
  identity: { name: string; verifiedAt: Date } | null;
  /** Whether the person is signed in as themselves, so they can keep documents (P40). */
  canKeep: boolean;
  /** P39: the referees Gaff will email when they share. */
  referees: Array<{ kind: 'landlord' | 'employer'; name: string; email: string }>;
  /** Whether it's been shared already. */
  shared: boolean;
}

/** P30, P39: what the renter's page shows of their documents, and what sharing will send. */
export async function documentsForRenter(
  token: string,
  userId: string | null,
  now: Date = new Date(),
): Promise<DocumentsPage | null> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return null;
  const page = await onRenterLink(link, userId, async (tx) => {
    const found = await situation(tx, link);
    if (!found) return null;
    const rows = await ownDocuments(tx, link.subjectId, userId);
    const references = await tx
      .select({ kind: checks.kind, name: checks.refereeName, email: checks.refereeEmail })
      .from(checks)
      .where(and(eq(checks.applicationId, link.subjectId), eq(checks.status, 'to_do')));
    return { found, rows, references };
  });
  if (!page) return null;
  const { found, rows, references } = page;
  const today = irishToday(now);
  const flags = flagged(rows, found, today);
  const documents = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    reading: readingOf(row),
    readBy: row.readBy,
    flags: flags.get(row.id) ?? [],
    correctedByRenter: row.correctedByRenter,
    fromProfile: row.applicationId !== link.subjectId,
    hasFile: row.storageKey !== null,
  }));
  return {
    ask: found.ask,
    kinds: kindsFor(found.ask),
    documents,
    answered: askAnswered(
      found.ask,
      documents.map((d) => d.kind),
    ),
    canAdd: rows.filter((r) => r.applicationId === link.subjectId).length < MAX_DOCUMENTS_PER_CHECK,
    readerOn: await aiTaskIsOffered('document', now),
    matchName: found.matchName,
    identity: found.verified ? { name: found.verified.name, verifiedAt: found.verified.at } : null,
    canKeep: userId !== null,
    referees: references.flatMap((r) =>
      r.name && r.email && (r.kind === 'landlord_reference' || r.kind === 'employer_reference')
        ? [
            {
              kind: r.kind === 'landlord_reference' ? ('landlord' as const) : ('employer' as const),
              name: r.name,
              email: r.email,
            },
          ]
        : [],
    ),
    shared: found.income.status === 'answered',
  };
}

export type AddProblem = FileProblem | 'link' | 'closed' | 'full' | 'kind';

const kindSchema = z.enum(documentKinds);

/**
 * P36, P37, P38: one document added. Read by its bytes, prepared (a photo upright and stripped),
 * encrypted and kept; then read by Gaff, if the reader is on, and checked at once. The renter
 * sees the reading and what to fix straight away. Without a reading, a work document waits for
 * a person at the letting agency to look at it, and for other income the renter enters what it
 * says (P5).
 */
export async function addDocument(
  token: string,
  userId: string | null,
  input: { kind: string; bytes: Buffer },
  options: { now?: Date; ai?: AiProvider; store?: DocumentStore } = {},
): Promise<{ ok: true; documentId: string } | { ok: false; problem: AddProblem }> {
  const now = options.now ?? new Date();
  const store = options.store ?? documentStore();
  const kind = kindSchema.safeParse(input.kind);
  if (!kind.success) return { ok: false, problem: 'kind' };
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return { ok: false, problem: 'link' };
  const before = await onRenterLink(link, userId, async (tx) => {
    const found = await situation(tx, link);
    if (!found || found.income.status === 'answered') return 'closed' as const;
    if (!kindsFor(found.ask).includes(kind.data)) return 'kind' as const;
    const held = await tx
      .select({ id: renterDocuments.id })
      .from(renterDocuments)
      .where(eq(renterDocuments.applicationId, link.subjectId));
    return held.length >= MAX_DOCUMENTS_PER_CHECK ? ('full' as const) : null;
  });
  if (before) return { ok: false, problem: before };
  const prepared = await prepareDocument(input.bytes);
  if (!prepared.ok) return { ok: false, problem: prepared.problem };
  const today = irishToday(now);
  const reading = await readDocument({
    document: prepared.document,
    saidKind: kind.data,
    today,
    organisationId: link.organisationId,
    ai: options.ai,
  });
  const key = await keepFile(
    { bytes: prepared.document.bytes, type: prepared.document.type },
    store,
  );
  try {
    const documentId = await onRenterLink(link, userId, async (tx) => {
      const found = await situation(tx, link);
      if (!found || found.income.status === 'answered') return null;
      const [row] = await tx
        .insert(renterDocuments)
        .values({
          applicationId: link.subjectId,
          kind: kind.data,
          storageKey: key,
          contentType: prepared.document.type,
          bytes: prepared.document.bytes.length,
          pages: prepared.document.pages,
          readingSealed: reading ? sealJson(reading) : null,
          readBy: reading ? 'gaff' : 'nobody',
          documentDate: reading?.date ?? null,
          deleteAfter: unsharedDeleteAfter(now),
        })
        .returning({ id: renterDocuments.id });
      const id = row!.id;
      if (found.income.status === 'to_do') {
        await tx
          .update(checks)
          .set({ status: 'in_progress', requestedAt: now })
          .where(eq(checks.id, found.income.id));
      }
      await recordEvent(tx, {
        organisationId: link.organisationId,
        lettingId: found.application.lettingId,
        actor: { type: 'renter', applicationId: link.subjectId },
        type: 'document.added',
        subject: { type: 'document', id },
        data: { documentId: id },
      });
      await recordEvent(tx, {
        organisationId: link.organisationId,
        lettingId: found.application.lettingId,
        actor: reading ? { type: 'ai' } : { type: 'system' },
        type: 'document.read',
        subject: { type: 'document', id },
        data: { documentId: id, by: reading ? 'gaff' : 'nobody' },
      });
      return id;
    });
    if (!documentId) {
      await dropFiles([key], store);
      return { ok: false, problem: 'closed' };
    }
    return { ok: true, documentId };
  } catch (error) {
    await dropFiles([key], store);
    throw error;
  }
}

/**
 * P36: the first step of sending a document straight to the store, where the store can sign an
 * upload (Supabase), so a 10 MB file never passes through a function's request limit. Where it
 * can't (the local store), the answer is `server`, and the file comes through Gaff's own route.
 */
export async function startDocumentUpload(
  token: string,
  file: { contentType: string; bytes: number },
  store: DocumentStore = documentStore(),
): Promise<
  | { via: 'server' }
  | { via: 'store'; uploadId: string; target: DocumentUploadTarget }
  | { via: 'none'; problem: AddProblem }
> {
  if (!store.signedUpload) return { via: 'server' };
  if (!(documentTypes as readonly string[]).includes(file.contentType)) {
    return { via: 'none', problem: 'not_a_document' };
  }
  if (file.bytes <= 0) return { via: 'none', problem: 'empty' };
  if (file.bytes > MAX_DOCUMENT_BYTES) return { via: 'none', problem: 'too_big' };
  if (!(await resolveAccessLink(token, 'renter'))) return { via: 'none', problem: 'link' };
  const uploadId = crypto.randomUUID();
  return {
    via: 'store',
    uploadId,
    target: await store.signedUpload(uploadKey(uploadId), file.contentType),
  };
}

/** P36: the browser has sent the document to the store. Gaff reads it, keeps it, deletes the original. */
export async function finishDocumentUpload(
  token: string,
  userId: string | null,
  input: { uploadId: string; kind: string },
  options: { now?: Date; ai?: AiProvider; store?: DocumentStore } = {},
): Promise<{ ok: true; documentId: string } | { ok: false; problem: AddProblem }> {
  const store = options.store ?? documentStore();
  const key = uploadKey(z.uuid().parse(input.uploadId));
  try {
    const sent = await store.get(key);
    if (!sent) return { ok: false, problem: 'empty' };
    if (sent.bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, problem: 'too_big' };
    return await addDocument(token, userId, { kind: input.kind, bytes: sent.bytes }, options);
  } finally {
    await store.remove([key]);
  }
}

async function ownRow(tx: Tx, documentId: string, applicationId: string, userId: string | null) {
  const rows = await ownDocuments(tx, applicationId, userId);
  return rows.find((row) => row.id === documentId) ?? null;
}

/**
 * P39, P5: the renter corrects what Gaff read, or enters what a document says where it wasn't
 * read. The letter sees it as changed by the renter.
 */
export async function correctDocument(
  token: string,
  userId: string | null,
  documentId: string,
  values: CorrectionValues,
  now: Date = new Date(),
): Promise<
  | { ok: true }
  | { ok: false; errors: Partial<Record<keyof CorrectionValues, string>> }
  | { ok: false; closed: true }
> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link || !z.uuid().safeParse(documentId).success) return { ok: false, closed: true };
  return onRenterLink(link, userId, async (tx) => {
    const found = await situation(tx, link);
    const row = found ? await ownRow(tx, documentId, link.subjectId, userId) : null;
    if (!found || !row || found.income.status === 'answered') return { ok: false, closed: true };
    const corrected = correctedReading(row.kind, values, irishToday(now));
    if (!corrected.ok) return { ok: false, errors: corrected.errors };
    await tx
      .update(renterDocuments)
      .set({
        readingSealed: sealJson(corrected.reading),
        readBy: row.readBy === 'gaff' ? 'gaff' : 'renter',
        correctedByRenter: true,
        documentDate: corrected.reading.date,
      })
      .where(eq(renterDocuments.id, row.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: found.application.lettingId,
      actor: { type: 'renter', applicationId: link.subjectId },
      type: 'document.corrected',
      subject: { type: 'document', id: row.id },
      data: { documentId: row.id },
    });
    return { ok: true };
  });
}

/** One of the renter's documents, for the change screen: its kind and what was read. */
export async function documentForRenter(
  token: string,
  userId: string | null,
  documentId: string,
): Promise<{ kind: DocumentKind; reading: DocumentReading; readBy: Row['readBy'] } | null> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link || !z.uuid().safeParse(documentId).success) return null;
  return onRenterLink(link, userId, async (tx) => {
    const found = await situation(tx, link);
    const row = found ? await ownRow(tx, documentId, link.subjectId, userId) : null;
    if (!found || !row || found.income.status === 'answered') return null;
    return { kind: row.kind, reading: readingOf(row), readBy: row.readBy };
  });
}

/** The renter takes a document off, before sharing: it and its file are deleted at once. */
export async function removeDocument(
  token: string,
  userId: string | null,
  documentId: string,
  store: DocumentStore = documentStore(),
): Promise<void> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link || !z.uuid().safeParse(documentId).success) return;
  const key = await onRenterLink(link, userId, async (tx) => {
    const found = await situation(tx, link);
    const row = found ? await ownRow(tx, documentId, link.subjectId, userId) : null;
    if (!found || !row) return undefined;
    await tx.delete(renterDocuments).where(eq(renterDocuments.id, row.id));
    await recordEvent(tx, {
      organisationId: link.organisationId,
      lettingId: found.application.lettingId,
      actor: { type: 'renter', applicationId: link.subjectId },
      type: 'document.removed',
      subject: { type: 'document', id: row.id },
      data: { documentId: row.id },
    });
    return row.storageKey;
  });
  if (key) await dropFiles([key], store);
}

/**
 * P39 to P41: everything shared in one step, as the renter saw it on the screen before.
 * - Each work document is copied to a separate object of the letter's, with its reading and
 *   flags, deleted when the tenancy starts or the application closes, 30 days at the latest.
 * - A statement of other income goes to the letter as a reading alone, as regular income with
 *   no kind and no file (P33, rule 3). The statement itself is deleted now: this is when the
 *   renter confirms what Gaff read.
 * - The renter's own copies are deleted now, unless they ticked "Keep these for my next
 *   application" (P40, unticked by default, signed in only), and then when they go out of date.
 * - The referees they named are emailed now (P39).
 * Nothing here judges anyone: the letter reads the evidence and decides (rule 1).
 */
export async function shareChecks(
  token: string,
  userId: string | null,
  input: { keep: boolean },
  options: { now?: Date; store?: DocumentStore } = {},
): Promise<{ ok: true } | { ok: false; problem: 'link' | 'closed' | 'nothing' }> {
  const now = options.now ?? new Date();
  const store = options.store ?? documentStore();
  const link = await resolveAccessLink(token, 'renter');
  if (!link) return { ok: false, problem: 'link' };
  const loaded = await onRenterLink(link, userId, async (tx) => {
    const found = await situation(tx, link);
    if (!found || found.income.status === 'answered') return null;
    return { found, rows: await ownDocuments(tx, link.subjectId, userId) };
  });
  if (!loaded) return { ok: false, problem: 'closed' };
  if (loaded.rows.length === 0) return { ok: false, problem: 'nothing' };
  // The letter's own copies, made before the record says they exist.
  const copies = new Map<string, string>();
  for (const row of loaded.rows) {
    if (row.kind === 'other_income' || !row.storageKey) continue;
    const copy = await copyFile(row.storageKey, store);
    if (copy) copies.set(row.id, copy);
  }
  const today = irishToday(now);
  const toDrop: Array<string | null> = [];
  try {
    const done = await onRenterLink(link, userId, async (tx) => {
      const found = await situation(tx, link);
      if (!found || found.income.status === 'answered') return false;
      const rows = await ownDocuments(tx, link.subjectId, userId);
      const flags = flagged(rows, found, today);
      let toLookAt = 0;
      let kept = 0;
      for (const row of rows) {
        const rowFlags = flags.get(row.id) ?? [];
        if (rowFlags.length > 0) toLookAt += 1;
        const regular = row.kind === 'other_income';
        await tx.insert(checkDocuments).values({
          organisationId: link.organisationId,
          lettingId: found.application.lettingId,
          applicationId: link.subjectId,
          checkId: found.income.id,
          kind: letterKindOf(row.kind),
          storageKey: regular ? null : (copies.get(row.id) ?? null),
          contentType: regular ? null : row.contentType,
          readingSealed: row.readingSealed,
          readBy: row.readBy,
          flags: rowFlags,
          documentDate: row.documentDate,
          correctedByRenter: row.correctedByRenter,
          sharedAt: now,
          deleteAfter: letterCopyDeleteAfter(now),
        });
        const keep =
          userId !== null &&
          mayKeep(row.kind) &&
          (input.keep || row.applicationId !== link.subjectId);
        if (keep) {
          kept += 1;
          await tx
            .update(renterDocuments)
            .set({
              userId,
              confirmedAt: now,
              sharedAt: row.sharedAt ?? now,
              deleteAfter: keptUntil(row.kind, row.documentDate, now),
            })
            .where(eq(renterDocuments.id, row.id));
          continue;
        }
        // P33, P40: not kept, so the renter's copy goes now; a statement of other income always.
        toDrop.push(row.storageKey);
        await tx.delete(renterDocuments).where(eq(renterDocuments.id, row.id));
        await recordEvent(tx, {
          organisationId: link.organisationId,
          lettingId: found.application.lettingId,
          actor: { type: 'system' },
          type: 'document.deleted',
          subject: { type: 'document', id: row.id },
          data: { documentId: row.id, copy: 'renter' },
        });
      }
      await tx
        .update(checks)
        .set({
          status: 'answered',
          completedAt: now,
          resultSealed: sealJson({ sharedAt: now.toISOString(), toLookAt }),
        })
        .where(eq(checks.id, found.income.id));
      const referees = await askNamedReferees(tx, {
        organisationId: link.organisationId,
        applicationId: link.subjectId,
        now,
      });
      await recordEvent(tx, {
        organisationId: link.organisationId,
        lettingId: found.application.lettingId,
        actor: { type: 'renter', applicationId: link.subjectId },
        type: 'documents.shared',
        subject: { type: 'check', id: found.income.id },
        data: { checkId: found.income.id, documents: rows.length, toLookAt, kept, referees },
      });
      await recordEvent(tx, {
        organisationId: link.organisationId,
        lettingId: found.application.lettingId,
        actor: { type: 'renter', applicationId: link.subjectId },
        type: 'check.completed',
        subject: { type: 'check', id: found.income.id },
        data: { checkId: found.income.id, kind: 'income', outcome: 'answered' },
      });
      await noteCheckProgress(tx, link.subjectId);
      return true;
    });
    if (!done) {
      await dropFiles([...copies.values()], store);
      return { ok: false, problem: 'closed' };
    }
  } catch (error) {
    await dropFiles([...copies.values()], store);
    throw error;
  }
  await dropFiles(toDrop, store);
  return { ok: true };
}

/** For tests and the renter's own download of a kept file: the file, decrypted. */
export async function renterDocumentFile(
  token: string,
  userId: string | null,
  documentId: string,
  store: DocumentStore = documentStore(),
): Promise<Buffer | null> {
  const link = await resolveAccessLink(token, 'renter');
  if (!link || !z.uuid().safeParse(documentId).success) return null;
  const key = await onRenterLink(link, userId, async (tx) => {
    const row = await ownRow(tx, documentId, link.subjectId, userId);
    return row?.storageKey ?? null;
  });
  return key ? readFile(key, store) : null;
}
