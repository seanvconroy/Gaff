import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { documentStore } from '@/adapters/documents';
import { withOrg } from '@/db/client';
import { applications, checkDocuments, checks } from '@/db/schema';
import { describeReference } from '@/domain/checks/checks';
import type { DocumentFlag } from '@/domain/documents/flags';
import { isPersonalEmail } from '@/domain/documents/flags';
import { letterMayOpen, type LetterKind } from '@/domain/documents/kinds';
import type { DocumentReading } from '@/domain/documents/reading';
import { openJson } from '@/lib/crypto';
import type { DocumentStore } from '@/ports/document-store';
import type { Member } from '@/server/auth/member';
import { recordEvent } from '@/server/record/events';
import { readFile } from './files';

/**
 * BA-16 (P44 to P49): what the letting's team sees of a chosen renter's checks, in words, and
 * the work documents they may open while they're kept. Reached only through withOrg(), for a
 * renter they chose: the renter's own documents are in another zone (`renter_documents`), which
 * no query here can reach, and other income is here only as a reading of regular income with no
 * kind and no file (P33, rule 3). Nothing here is a score, a ratio or a "pass" (rule 1).
 */
const CHOSEN = ['preferred', 'backup', 'offered', 'accepted'] as const;

/**
 * The reading the letter sees. For regular income, only the amount, how often, the date, and
 * whether the name matched: never the employer field, which is empty by construction anyway.
 */
export interface SharedReading {
  amountCents: number | null;
  period: DocumentReading['period'];
  date: string | null;
  employer: string | null;
  name: string | null;
  taxYear: number | null;
}

export interface SharedDocument {
  id: string;
  kind: LetterKind;
  reading: SharedReading | null;
  readBy: 'gaff' | 'renter' | 'nobody';
  flags: DocumentFlag[];
  correctedByRenter: boolean;
  /** P45: a work document still kept, which a member may open. Never regular income. */
  canOpen: boolean;
  sharedAt: Date;
  deleteAfter: Date;
  deleted: boolean;
}

export interface ChosenRenterPack {
  applicationId: string;
  name: string;
  status: string;
  /** P44: the household income they gave on their application, beside the documents. */
  householdIncomeCents: number | null;
  earning: string | null;
  identity: { status: string; verifiedName: string | null; checkedAt: Date | null };
  employer: {
    status: string;
    refereeName: string | null;
    summary: string | null;
    /** P38: Gaff sent this reference to a personal email address. */
    personalAddress: boolean;
  } | null;
  landlord: { status: string; refereeName: string | null; summary: string | null } | null;
  documents: SharedDocument[];
  sharedAt: Date | null;
}

function shared(kind: LetterKind, reading: DocumentReading | null): SharedReading | null {
  if (!reading) return null;
  return {
    amountCents: reading.amountCents,
    period: reading.period,
    date: reading.date,
    // Rule 3: regular income never says who pays it.
    employer: kind === 'regular_income' ? null : reading.employer,
    name: reading.name,
    taxYear: reading.taxYear,
  };
}

/** P44: one chosen renter's checks, for the letting's team. Null for anyone not chosen. */
export async function chosenRenterPack(
  member: Member,
  lettingId: string,
  applicationId: string,
): Promise<ChosenRenterPack | null> {
  if (!z.uuid().safeParse(applicationId).success) return null;
  return withOrg(member.organisationId, async (tx) => {
    const [application] = await tx
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.lettingId, lettingId)));
    if (!application || application.personalDataDeletedAt) return null;
    if (!(CHOSEN as readonly string[]).includes(application.status)) return null;
    const own = await tx.select().from(checks).where(eq(checks.applicationId, applicationId));
    if (own.length === 0) return null;
    const find = (kind: string) => own.find((c) => c.kind === kind);
    const identity = find('identity');
    const identityResult =
      identity?.status === 'passed' && identity.resultSealed
        ? openJson<{ verifiedName?: string; verifiedAt?: string }>(identity.resultSealed)
        : null;
    const reference = (kind: 'landlord_reference' | 'employer_reference') => {
      const check = find(kind);
      if (!check) return null;
      const answers =
        check.status === 'answered' && check.resultSealed
          ? openJson<Record<string, string>>(check.resultSealed)
          : null;
      return {
        status: check.status,
        refereeName: check.refereeName,
        summary: answers ? describeReference(kind, answers) : null,
        personalAddress: check.refereeEmail ? isPersonalEmail(check.refereeEmail) : false,
      };
    };
    const rows = await tx
      .select()
      .from(checkDocuments)
      .where(eq(checkDocuments.applicationId, applicationId))
      .orderBy(checkDocuments.createdAt);
    const income = find('income');
    const incomeResult =
      income?.status === 'answered' && income.resultSealed
        ? openJson<{ sharedAt?: string }>(income.resultSealed)
        : null;
    const landlord = reference('landlord_reference');
    return {
      applicationId,
      name: application.fullName,
      status: application.status,
      householdIncomeCents: application.monthlyIncomeCents,
      earning: application.earning,
      identity: {
        status: identity?.status ?? 'not_needed',
        verifiedName: identityResult?.verifiedName ?? null,
        checkedAt: identityResult?.verifiedAt ? new Date(identityResult.verifiedAt) : null,
      },
      employer: reference('employer_reference'),
      landlord: landlord
        ? { status: landlord.status, refereeName: landlord.refereeName, summary: landlord.summary }
        : null,
      documents: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        reading: shared(
          row.kind,
          row.readingSealed ? openJson<DocumentReading>(row.readingSealed) : null,
        ),
        readBy: row.readBy,
        flags: row.flags,
        correctedByRenter: row.correctedByRenter,
        canOpen: letterMayOpen(row.kind) && row.storageKey !== null && row.deletedAt === null,
        sharedAt: row.sharedAt,
        deleteAfter: row.deleteAfter,
        deleted: row.deletedAt !== null,
      })),
      sharedAt: incomeResult?.sharedAt ? new Date(incomeResult.sharedAt) : null,
    };
  });
}

/**
 * P45: a member opens a shared work document while it's kept. Each opening is recorded. There is
 * no way to open regular income: it has no file, and its kind is refused here too.
 */
export async function openSharedDocument(
  member: Member,
  lettingId: string,
  documentId: string,
  store: DocumentStore = documentStore(),
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!z.uuid().safeParse(documentId).success) return null;
  const row = await withOrg(member.organisationId, async (tx) => {
    const [found] = await tx
      .select({
        id: checkDocuments.id,
        kind: checkDocuments.kind,
        storageKey: checkDocuments.storageKey,
        contentType: checkDocuments.contentType,
        lettingId: checkDocuments.lettingId,
      })
      .from(checkDocuments)
      .where(
        and(
          eq(checkDocuments.id, documentId),
          eq(checkDocuments.lettingId, lettingId),
          isNull(checkDocuments.deletedAt),
        ),
      );
    if (!found || !letterMayOpen(found.kind) || !found.storageKey || !found.contentType) {
      return null;
    }
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: found.lettingId,
      actor: { type: 'person', userId: member.userId },
      type: 'document.viewed',
      subject: { type: 'document', id: found.id },
      data: { documentId: found.id },
    });
    return found;
  });
  if (!row?.storageKey || !row.contentType) return null;
  const bytes = await readFile(row.storageKey, store);
  return bytes ? { bytes, contentType: row.contentType } : null;
}
