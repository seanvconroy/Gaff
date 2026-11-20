import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAiProviderForTests } from '@/adapters/ai';
import { fakeAi, fakeAiWith } from '@/adapters/ai/fake';
import { withOrg, withPerson, withSystem } from '@/db/client';
import {
  applications,
  checkDocuments,
  checks,
  devDocumentStore,
  events,
  messages,
  renterDocuments,
} from '@/db/schema';
import { resetEnvForTests } from '@/lib/env';
import { deleteProfile } from '@/server/accounts/delete-profile';
import { findConfirmation, grantConfirmation } from '@/server/auth/confirm';
import { forgetAiSpend } from '@/server/ai/usage';
import { chooseApplicants } from '@/server/applications/choose';
import { recordProviderResult, submitReferees } from '@/server/checks/checks';
import { chosenRenterPack, openSharedDocument } from '@/server/documents/letter';
import {
  addDocument,
  correctDocument,
  documentsForRenter,
  removeDocument,
  shareChecks,
} from '@/server/documents/renter';
import { sweepDocuments } from '@/server/documents/retention';
import { closeLetting } from '@/server/lettings/close';
import { sweepPersonalData } from '@/server/retention/sweep';
import { otherIncomeStatementPdf, payslipPdf, savingsStatementPdf } from '../fixtures/documents';
import {
  createTestMember,
  createTestPerson,
  peopleWhoApplied,
  tokenInMessage,
  type Member,
} from './helpers';

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

async function chosen(options: { earning?: 'employed' | 'self_employed' | 'other' } = {}) {
  const member = await createTestMember();
  const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800, 6000]);
  if (options.earning) {
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(applications)
        .set({ earning: options.earning })
        .where(inArray(applications.id, ids)),
    );
  }
  await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  const token = await tokenInMessage(member, ids[0]!, 'checks_invitation');
  return { member, lettingId, ids, token };
}

const payslip = (name = 'Renter 1', date = daysAgo(10)) =>
  payslipPdf({ name, date, netCents: 148_000, pps: '1234567T' });

async function identityPasses(member: Member, applicationId: string, name: string) {
  const [identity] = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(checks)
      .where(and(eq(checks.applicationId, applicationId), eq(checks.kind, 'identity'))),
  );
  await recordProviderResult(identity!.id, {
    kind: 'identity',
    result: { verified: true, verifiedName: name },
  });
}

/** Every row and file of documents there is, seen as the system: for "nothing is left". */
async function everything() {
  return withSystem(async (tx) => ({
    renter: await tx.select().from(renterDocuments),
    letter: await tx.select().from(checkDocuments),
    files: await tx.select({ key: devDocumentStore.key }).from(devDocumentStore),
  }));
}

beforeEach(() => forgetAiSpend());
afterEach(() => {
  setAiProviderForTests(undefined);
  vi.unstubAllEnvs();
  resetEnvForTests();
  forgetAiSpend();
});

describe('P30 to P35: what is asked, and only of someone chosen', () => {
  it('P31: from a job, payslips; the page says so, and nothing else of theirs can be added', async () => {
    const { token } = await chosen();
    const page = await documentsForRenter(token, null);
    expect(page).toMatchObject({
      ask: 'payslips',
      kinds: ['payslip', 'contract', 'employer_letter', 'other_income'],
      documents: [],
      answered: false,
      shared: false,
    });
    expect(await addDocument(token, null, { kind: 'revenue_statement', bytes: payslip() })).toEqual(
      { ok: false, problem: 'kind' },
    );
  });

  it('P32, P33: self-employed and other income are asked for their own documents', async () => {
    expect(
      (await documentsForRenter((await chosen({ earning: 'self_employed' })).token, null))!.ask,
    ).toBe('self_employed');
    expect(
      (await documentsForRenter((await chosen({ earning: 'other' })).token, null))!.kinds,
    ).toEqual(['other_income']);
  });

  it('rule 2: nothing is asked of, or taken from, someone who wasn’t chosen', async () => {
    const { member, ids } = await chosen();
    const notChosen = await tokenInMessage(member, ids[2]!, 'apply_invitation');
    expect(await documentsForRenter(notChosen, null)).toBeNull();
    expect(await addDocument(notChosen, null, { kind: 'payslip', bytes: payslip() })).toEqual({
      ok: false,
      problem: 'closed',
    });
    expect((await everything()).renter.filter((r) => r.applicationId === ids[2])).toEqual([]);
  });

  it('P36: a file that isn’t a PDF, JPG or PNG, or is over 10 pages, is refused by its bytes', async () => {
    const { token } = await chosen();
    expect(
      await addDocument(token, null, { kind: 'payslip', bytes: Buffer.from('payslip.pdf') }),
    ).toEqual({ ok: false, problem: 'not_a_document' });
    const { pdfWith } = await import('../fixtures/documents');
    expect(
      await addDocument(token, null, { kind: 'payslip', bytes: pdfWith(['PAYSLIP'], 11) }),
    ).toEqual({ ok: false, problem: 'too_many_pages' });
  });
});

describe('P37, P38: read by the fake model, and checked at once', () => {
  it('P37: reads a payslip into a few fields, keeps the file encrypted, and logs no words', async () => {
    const { member, ids, token } = await chosen();
    const added = await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    expect(added.ok).toBe(true);
    const page = (await documentsForRenter(token, null))!;
    expect(page.documents).toHaveLength(1);
    expect(page.documents[0]).toMatchObject({
      kind: 'payslip',
      readBy: 'gaff',
      flags: [],
      reading: { name: 'Renter 1', employer: 'Acme Ltd', amountCents: 148_000 },
    });
    // Rule 2: the PPS number on the payslip is in no reading and no column.
    const { renter, files } = await everything();
    const mine = renter.find((r) => r.applicationId === ids[0])!;
    expect(JSON.stringify(mine)).not.toContain('1234567T');
    const [stored] = await withSystem((tx) =>
      tx.select().from(devDocumentStore).where(eq(devDocumentStore.key, mine.storageKey!)),
    );
    expect(files.some((f) => f.key === mine.storageKey)).toBe(true);
    expect(stored!.bytes.includes(Buffer.from('Renter 1'))).toBe(false);
    // Rule 8: the record has the document's ID and how it was read, and no kind or amount.
    const logged = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(events)
        .where(eq(events.subjectId, added.ok ? added.documentId : '')),
    );
    expect(logged.map((e) => [e.type, e.data])).toEqual([
      ['document.added', { documentId: mine.id }],
      ['document.read', { documentId: mine.id, by: 'gaff' }],
    ]);
    // The income check is under way for the letter, with nothing of the document in it.
    const [income] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(checks)
        .where(and(eq(checks.applicationId, ids[0]!), eq(checks.kind, 'income'))),
    );
    expect(income).toMatchObject({ status: 'in_progress', resultSealed: null });
  });

  it('P38: flags a name that isn’t the name on their ID, an old payslip, and the wrong kind', async () => {
    const { member, ids, token } = await chosen();
    await identityPasses(member, ids[0]!, 'Niamh Kelly');
    await addDocument(token, null, { kind: 'payslip', bytes: payslip("Niamh O'Kelly") });
    await addDocument(token, null, {
      kind: 'payslip',
      bytes: payslip('Niamh Kelly', daysAgo(60)),
    });
    await addDocument(token, null, {
      kind: 'payslip',
      bytes: otherIncomeStatementPdf({
        name: 'Niamh Kelly',
        date: daysAgo(5),
        amountCents: 20_000,
      }),
    });
    const page = (await documentsForRenter(token, null))!;
    expect(page.matchName).toBe('Niamh Kelly');
    expect(page.documents.map((d) => d.flags)).toEqual([
      ['name_differs'],
      // Only the newest payslip need be recent: the old one is older by nature.
      [],
      ['kind_differs'],
    ]);
  });

  it('rule 2: a reading with a PPS number is refused, not cleaned, and the renter enters it', async () => {
    setAiProviderForTests(
      fakeAiWith({
        async readDocument(request) {
          const reply = await fakeAi.readDocument(request);
          return { ...reply, output: { ...(reply.output as object), name: 'Renter 1 1234567T' } };
        },
      }),
    );
    const { token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    const [document] = (await documentsForRenter(token, null))!.documents;
    expect(document).toMatchObject({ readBy: 'nobody', flags: ['not_read'] });
    expect(JSON.stringify((await everything()).renter)).not.toContain('1234567T');
  });

  it('P5, P8: with the task switched off, nothing is read, and a person will look', async () => {
    vi.stubEnv('AI_TASKS_OFF', 'document');
    resetEnvForTests();
    const { token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    const page = (await documentsForRenter(token, null))!;
    expect(page.readerOn).toBe(false);
    expect(page.documents[0]).toMatchObject({ readBy: 'nobody', flags: ['not_read'] });
  });

  it('P4, P5: with the month’s budget spent, nothing is read either', async () => {
    vi.stubEnv('AI_MONTHLY_BUDGET_USD', '0');
    resetEnvForTests();
    setAiProviderForTests({ ...fakeAi, name: 'anthropic' });
    const { token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    const page = (await documentsForRenter(token, null))!;
    expect(page.readerOn).toBe(false);
    expect(page.documents[0]!.readBy).toBe('nobody');
  });
});

describe('P39: corrections, and sharing everything in one step', () => {
  it('P39: a correction is kept, and the letter sees it as changed by the renter', async () => {
    const { member, lettingId, ids, token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    const [document] = (await documentsForRenter(token, null))!.documents;
    expect(
      await correctDocument(token, null, document!.id, { name: 'Renter 1', amount: 'IE29 AIBK' }),
    ).toMatchObject({ ok: false, errors: { amount: 'amount' } });
    expect(
      await correctDocument(token, null, document!.id, { name: 'Renter 1 PPS 1234567T' }),
    ).toMatchObject({ ok: false, errors: { name: 'number_kept_out' } });
    expect(
      await correctDocument(token, null, document!.id, {
        name: 'Renter 1',
        date: daysAgo(3),
        employer: 'Acme Ltd',
        amount: '1,520',
        period: 'fortnightly',
      }),
    ).toEqual({ ok: true });
    await shareChecks(token, null, { keep: false });
    const pack = (await chosenRenterPack(member, lettingId, ids[0]!))!;
    expect(pack.documents).toHaveLength(1);
    expect(pack.documents[0]).toMatchObject({
      kind: 'payslip',
      correctedByRenter: true,
      canOpen: true,
      reading: { amountCents: 152_000, period: 'fortnightly' },
    });
    expect(pack.householdIncomeCents).toBe(520_000);
  });

  it('P39, P41: shares a separate copy, deletes the renter’s own, emails the referees, and logs counts', async () => {
    const { member, lettingId, ids, token } = await chosen();
    await submitReferees(token, {
      landlordName: 'Mary Kelly',
      landlordEmail: 'mary.kelly@example.ie',
      employerName: 'Seán Daly',
      employerEmail: 'sean.daly@gmail.com',
    });
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    const before = (await everything()).renter.find((r) => r.applicationId === ids[0])!;
    expect(await shareChecks(token, null, { keep: false })).toEqual({ ok: true });
    const after = await everything();
    // The renter's own copy is gone, row and file; the letter's is a different object.
    expect(after.renter.find((r) => r.applicationId === ids[0])).toBeUndefined();
    expect(after.files.some((f) => f.key === before.storageKey)).toBe(false);
    const copy = after.letter.find((l) => l.applicationId === ids[0])!;
    expect(copy.storageKey).not.toBe(before.storageKey);
    expect(after.files.some((f) => f.key === copy.storageKey)).toBe(true);
    // The referees are asked now.
    const requests = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, ids[0]!), eq(messages.kind, 'reference_request'))),
    );
    expect(requests.map((m) => m.toAddress).sort()).toEqual([
      'mary.kelly@example.ie',
      'sean.daly@gmail.com',
    ]);
    const pack = (await chosenRenterPack(member, lettingId, ids[0]!))!;
    // P38: a referee at a personal address is flagged to the letter, and nothing is blocked.
    expect(pack.employer).toMatchObject({ personalAddress: true });
    const [shared] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'documents.shared')),
    );
    expect(shared!.data).toMatchObject({ documents: 1, toLookAt: 0, kept: 0, referees: 2 });
    // It can't be shared twice, or added to after.
    expect(await shareChecks(token, null, { keep: false })).toEqual({
      ok: false,
      problem: 'closed',
    });
    expect(await addDocument(token, null, { kind: 'payslip', bytes: payslip() })).toEqual({
      ok: false,
      problem: 'closed',
    });
  });

  it('P45: a member opens a shared payslip while it’s kept, and each opening is recorded', async () => {
    const { member, lettingId, ids, token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    await shareChecks(token, null, { keep: false });
    const [document] = (await chosenRenterPack(member, lettingId, ids[0]!))!.documents;
    const opened = await openSharedDocument(member, lettingId, document!.id);
    expect(opened!.contentType).toBe('application/pdf');
    expect(opened!.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const viewed = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'document.viewed')),
    );
    expect(viewed.map((e) => e.data)).toEqual([{ documentId: document!.id }]);
    // Another organisation's member can't.
    const other = await createTestMember();
    expect(await openSharedDocument(other, lettingId, document!.id)).toBeNull();
  });
});

describe('P33, rule 3: a statement of other income never reaches the letter', () => {
  it('rule 3: before sharing, no operator query reaches the renter’s documents at all', async () => {
    const { member, token } = await chosen({ earning: 'other' });
    await addDocument(token, null, {
      kind: 'other_income',
      bytes: otherIncomeStatementPdf({ name: 'Renter 1', date: daysAgo(5), amountCents: 27_730 }),
    });
    expect((await everything()).renter.length).toBeGreaterThan(0);
    const seen = await withOrg(member.organisationId, (tx) => tx.select().from(renterDocuments));
    expect(seen).toEqual([]);
    const raw = await withOrg(member.organisationId, (tx) =>
      tx.execute(sql`select count(*)::int as n from renter_documents`),
    );
    expect(raw.rows[0]).toEqual({ n: 0 });
  });

  it('P33: after sharing, the letter has the amount as regular income, with no kind, payer or file', async () => {
    const { member, lettingId, ids, token } = await chosen({ earning: 'other' });
    await addDocument(token, null, {
      kind: 'other_income',
      bytes: otherIncomeStatementPdf({ name: 'Renter 1', date: daysAgo(5), amountCents: 27_730 }),
    });
    await addDocument(token, null, {
      kind: 'other_income',
      bytes: savingsStatementPdf({ name: 'Renter 1', date: daysAgo(5), balanceCents: 1_250_000 }),
    });
    const keys = (await everything()).renter
      .filter((r) => r.applicationId === ids[0])
      .map((r) => r.storageKey);
    await shareChecks(token, null, { keep: true });
    const after = await everything();
    // The statements are deleted at once, kept or not: other income is never kept.
    expect(after.renter.filter((r) => r.applicationId === ids[0])).toEqual([]);
    for (const key of keys) expect(after.files.some((f) => f.key === key)).toBe(false);
    const pack = (await chosenRenterPack(member, lettingId, ids[0]!))!;
    expect(pack.documents.map((d) => [d.kind, d.canOpen, d.reading?.employer])).toEqual([
      ['regular_income', false, null],
      ['regular_income', false, null],
    ]);
    expect(pack.documents[0]!.reading).toMatchObject({ amountCents: 27_730, period: 'weekly' });
    expect(JSON.stringify(pack)).not.toMatch(/Department|Pension|Credit Union|other_income/i);
    const stored = after.letter.filter((l) => l.applicationId === ids[0]);
    expect(stored.every((l) => l.storageKey === null && l.contentType === null)).toBe(true);
    expect(await openSharedDocument(member, lettingId, stored[0]!.id)).toBeNull();
    // The database refuses a regular income row with a file, whatever code tries.
    await expect(
      withOrg(member.organisationId, (tx) =>
        tx
          .update(checkDocuments)
          .set({ storageKey: 'documents/x', contentType: 'application/pdf' })
          .where(eq(checkDocuments.id, stored[0]!.id)),
      ),
    ).rejects.toThrow();
  });
});

describe('P40, P41, P49, rule 9: every copy is deleted on its date, and nothing is left', () => {
  it('P40: kept documents stay on the profile until out of date, are offered next time, and go with the profile', async () => {
    const renter = await createTestPerson({ name: 'Renter 1' });
    const { member, lettingId, ids, token } = await chosen();
    await addDocument(token, renter.id, { kind: 'payslip', bytes: payslip() });
    await shareChecks(token, renter.id, { keep: true });
    const kept = await withPerson(renter.id, (tx) => tx.select().from(renterDocuments));
    expect(kept).toHaveLength(1);
    expect(kept[0]!.userId).toBe(renter.id);
    // Out of date three months after the payslip's date.
    expect(kept[0]!.deleteAfter.getTime()).toBeGreaterThan(Date.now() + 70 * DAY);
    // The letter's copy is its own.
    expect((await chosenRenterPack(member, lettingId, ids[0]!))!.documents).toHaveLength(1);
    // Another person can't see them.
    const someone = await createTestPerson();
    expect(await withPerson(someone.id, (tx) => tx.select().from(renterDocuments))).toEqual([]);
    // When it goes out of date, the nightly job deletes it, file and all.
    await sweepDocuments(new Date(Date.now() + 200 * DAY), {
      onlyOrganisationId: member.organisationId,
    });
    expect(await withPerson(renter.id, (tx) => tx.select().from(renterDocuments))).toEqual([]);
    expect((await everything()).files.some((f) => f.key === kept[0]!.storageKey)).toBe(false);
  });

  it('UX-PF-6: deleting the profile deletes kept documents and their files at once', async () => {
    const renter = await createTestPerson({ name: 'Renter 1' });
    const { token } = await chosen();
    await addDocument(token, renter.id, { kind: 'payslip', bytes: payslip() });
    await shareChecks(token, renter.id, { keep: true });
    const [kept] = await withPerson(renter.id, (tx) => tx.select().from(renterDocuments));
    const grant = await grantConfirmation(renter.id, 'delete_profile', 'email_code');
    await deleteProfile(renter, await findConfirmation(renter.id, 'delete_profile', grant));
    expect(
      await withSystem((tx) =>
        tx.select().from(renterDocuments).where(eq(renterDocuments.id, kept!.id)),
      ),
    ).toEqual([]);
    expect((await everything()).files.some((f) => f.key === kept!.storageKey)).toBe(false);
  });

  it('rule 9: an upload never shared goes after 30 days', async () => {
    const { member, ids, token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    const [row] = (await everything()).renter.filter((r) => r.applicationId === ids[0]);
    await sweepDocuments(new Date(Date.now() + 29 * DAY), {
      onlyOrganisationId: member.organisationId,
    });
    expect((await everything()).renter.some((r) => r.id === row!.id)).toBe(true);
    const swept = await sweepDocuments(new Date(Date.now() + 31 * DAY), {
      onlyOrganisationId: member.organisationId,
    });
    expect(swept.renterCopies).toBe(1);
    const left = await everything();
    expect(left.renter.some((r) => r.id === row!.id)).toBe(false);
    expect(left.files.some((f) => f.key === row!.storageKey)).toBe(false);
  });

  it('P41: the letter’s copy goes 30 days after sharing at the latest; its reading stays with the application', async () => {
    const { member, lettingId, ids, token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    await shareChecks(token, null, { keep: false });
    const [copy] = (await everything()).letter.filter((l) => l.applicationId === ids[0]);
    await sweepDocuments(new Date(Date.now() + 29 * DAY), {
      onlyOrganisationId: member.organisationId,
    });
    expect((await chosenRenterPack(member, lettingId, ids[0]!))!.documents[0]!.canOpen).toBe(true);
    await sweepDocuments(new Date(Date.now() + 31 * DAY), {
      onlyOrganisationId: member.organisationId,
    });
    const [after] = (await everything()).letter.filter((l) => l.id === copy!.id);
    expect(after).toMatchObject({ storageKey: null });
    expect(after!.deletedAt).not.toBeNull();
    expect((await everything()).files.some((f) => f.key === copy!.storageKey)).toBe(false);
    const [document] = (await chosenRenterPack(member, lettingId, ids[0]!))!.documents;
    expect(document).toMatchObject({
      canOpen: false,
      deleted: true,
      reading: { amountCents: 148_000 },
    });
    const deleted = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'document.deleted')),
    );
    expect(deleted.map((e) => e.data)).toContainEqual({ documentId: copy!.id, copy: 'letter' });
  });

  it('P41: the letter’s copy goes when the application closes', async () => {
    const closing = await chosen();
    await addDocument(closing.token, null, { kind: 'payslip', bytes: payslip() });
    await shareChecks(closing.token, null, { keep: false });
    await withOrg(closing.member.organisationId, (tx) =>
      tx
        .update(applications)
        .set({ status: 'not_chosen' })
        .where(eq(applications.id, closing.ids[0]!)),
    );
    await sweepDocuments(new Date(), { onlyOrganisationId: closing.member.organisationId });
    const [closed] = (await everything()).letter.filter((l) => l.applicationId === closing.ids[0]);
    expect(closed!.storageKey).toBeNull();

    // The tenancy starting ends it too (`letterCopyDue`, held in the unit tests).
  });

  it('P49: when the application’s personal data goes, so do the readings and any unshared upload', async () => {
    const { member, lettingId, ids, token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    await shareChecks(token, null, { keep: false });
    const backupToken = await tokenInMessage(member, ids[1]!, 'checks_invitation');
    await addDocument(backupToken, null, { kind: 'payslip', bytes: payslip('Renter 2') });
    const { deleteAfter } = await closeLetting(member, lettingId, 'withdrawn');
    await sweepPersonalData(new Date(`${deleteAfter}T12:00:00Z`), member.organisationId);
    await sweepDocuments(new Date(`${deleteAfter}T12:00:00Z`), {
      onlyOrganisationId: member.organisationId,
    });
    const left = await everything();
    expect(left.renter.filter((r) => ids.includes(r.applicationId))).toEqual([]);
    const letter = left.letter.filter((l) => ids.includes(l.applicationId));
    expect(letter.every((l) => l.readingSealed === null && l.storageKey === null)).toBe(true);
    // Nothing is left of any file.
    const keys = new Set(left.files.map((f) => f.key));
    expect(letter.some((l) => l.storageKey && keys.has(l.storageKey))).toBe(false);
  });

  it('the renter can take a document off before sharing, and it goes at once', async () => {
    const { ids, token } = await chosen();
    await addDocument(token, null, { kind: 'payslip', bytes: payslip() });
    const [row] = (await everything()).renter.filter((r) => r.applicationId === ids[0]);
    await removeDocument(token, null, row!.id);
    const left = await everything();
    expect(left.renter.some((r) => r.id === row!.id)).toBe(false);
    expect(left.files.some((f) => f.key === row!.storageKey)).toBe(false);
  });
});

describe('Rule 8: document events hold IDs, codes, counts and dates only', () => {
  it('never a kind, an amount or a name', async () => {
    const { member, token } = await chosen({ earning: 'other' });
    await addDocument(token, null, {
      kind: 'other_income',
      bytes: otherIncomeStatementPdf({ name: 'Renter 1', date: daysAgo(5), amountCents: 27_730 }),
    });
    await shareChecks(token, null, { keep: false });
    const logged = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ type: events.type, data: events.data })
        .from(events)
        .where(sql`${events.type} like 'document%'`),
    );
    expect(logged.length).toBeGreaterThan(2);
    const text = JSON.stringify(logged);
    expect(text).not.toMatch(/other_income|regular_income|27730|Renter 1|[Pp]ension|Department/);
  });
});
