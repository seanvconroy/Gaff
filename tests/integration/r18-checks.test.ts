import { asc, and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { accessLinks, applications, checks, events, messages } from '@/db/schema';
import { chooseApplicants } from '@/server/applications/choose';
import {
  checkResultsFor,
  loadReferenceRequest,
  markReferenceOverdue,
  recordProviderResult,
  requestChecks,
  startProviderCheck,
  submitReferees,
  submitReference,
} from '@/server/checks/checks';
import { closeLetting } from '@/server/lettings/close';
import { sweepPersonalData } from '@/server/retention/sweep';
import { createTestMember, peopleWhoApplied, tokenInMessage } from './helpers';

type Member = Awaited<ReturnType<typeof createTestMember>>;

async function chosen() {
  const member = await createTestMember();
  const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800, 6000]);
  await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  const token = await tokenInMessage(member, ids[0]!, 'checks_invitation');
  return { member, lettingId, ids, token };
}

const checksOfPerson = (member: Member, applicationId: string) =>
  withOrg(member.organisationId, (tx) =>
    tx.select().from(checks).where(eq(checks.applicationId, applicationId)),
  );

const refereeToken = (body: string) => /\/reference\/([A-Za-z0-9_-]{43})/.exec(body)![1]!;

describe('R18: checks only for the preferred applicant and the backup', () => {
  it('sets up checks for the two people chosen, explains them, and nobody else gets any', async () => {
    const { member, ids } = await chosen();
    expect((await checksOfPerson(member, ids[0]!)).map((c) => [c.kind, c.status]).sort()).toEqual([
      ['employer_reference', 'to_do'],
      ['identity', 'to_do'],
      ['income', 'to_do'],
      ['landlord_reference', 'to_do'],
    ]);
    expect(await checksOfPerson(member, ids[1]!)).toHaveLength(4);
    expect(await checksOfPerson(member, ids[2]!)).toEqual([]);
    const invite = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, ids[0]!), eq(messages.kind, 'checks_invitation'))),
    );
    expect(invite[0]!.subject).toBe('12 Ranelagh Road: a few checks before an offer');
    await expect(
      withOrg(member.organisationId, (tx) =>
        requestChecks(tx, {
          organisationId: member.organisationId,
          actorUserId: member.userId,
          applicationIds: [ids[2]!],
        }),
      ),
    ).rejects.toThrow('Checks are only for the preferred applicant and the backup (R18).');
  });
});

describe('R18: ID and income checks, through a provider', () => {
  it('sends the renter to the provider without their private link, and keeps only a sealed result', async () => {
    const { member, ids, token } = await chosen();
    const started = await startProviderCheck(token, 'identity');
    expect('redirectUrl' in started && started.redirectUrl).toMatch(
      /\/dev\/checks\/[0-9a-f-]{36}\?return=.*%2Fchecks%2Fdone%3Fkind%3Didentity$/,
    );
    expect(JSON.stringify(started)).not.toContain(token);
    const [identity] = (await checksOfPerson(member, ids[0]!)).filter((c) => c.kind === 'identity');
    expect(identity!.status).toBe('in_progress');

    await recordProviderResult(identity!.id, {
      kind: 'identity',
      result: { verified: true, verifiedName: 'Renter 1' },
    });
    const [stored] = (await checksOfPerson(member, ids[0]!)).filter((c) => c.kind === 'identity');
    expect(stored).toMatchObject({ status: 'passed', reason: null });
    expect(stored!.resultSealed).toMatch(/^v1:/);
    expect(stored!.resultSealed).not.toContain('Renter');
    const results = await withOrg(member.organisationId, (tx) => checkResultsFor(tx, [ids[0]!]));
    expect(results.get(ids[0]!)!.find((c) => c.kind === 'identity')!.verifiedName).toBe('Renter 1');
  });

  it('records a check that didn’t pass with a reason code, and lets the renter try again', async () => {
    const { member, ids, token } = await chosen();
    await startProviderCheck(token, 'income');
    const [income] = (await checksOfPerson(member, ids[0]!)).filter((c) => c.kind === 'income');
    await recordProviderResult(income!.id, {
      kind: 'income',
      result: { confirmed: false, reason: 'no_regular_income' },
    });
    expect((await checksOfPerson(member, ids[0]!)).find((c) => c.kind === 'income')).toMatchObject({
      status: 'not_passed',
      reason: 'no_regular_income',
      resultSealed: null,
    });
    await startProviderCheck(token, 'income');
    await recordProviderResult(income!.id, {
      kind: 'income',
      result: { confirmed: true, monthlyIncomeCents: 510_000 },
    });
    const results = await withOrg(member.organisationId, (tx) => checkResultsFor(tx, [ids[0]!]));
    expect(results.get(ids[0]!)!.find((c) => c.kind === 'income')).toMatchObject({
      status: 'passed',
      monthlyIncomeCents: 510_000,
    });
    const logged = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'check.completed')).orderBy(asc(events.id)),
    );
    expect(logged.map((e) => (e.data as { outcome: string }).outcome)).toEqual([
      'not_passed',
      'passed',
    ]);
  });
});

describe('R18: references', () => {
  it('emails each referee, reminds them twice, and stops once they answer', async () => {
    const { member, ids, token } = await chosen();
    expect(await submitReferees(token, { landlordName: 'Mary Kelly' })).toEqual({
      ok: false,
      errors: {
        landlordName:
          'Enter your last landlord’s name and email, or tick that you haven’t rented before.',
        employerName: 'Enter your employer’s name and email, or tick that you don’t have one.',
      },
    });
    expect(
      await submitReferees(token, {
        landlordName: 'Mary Kelly',
        landlordEmail: 'mary.kelly@example.ie',
        employerName: 'Seán Daly',
        employerEmail: 'sean.daly@example.ie',
      }),
    ).toEqual({ ok: true });
    const sent = await withOrg(member.organisationId, (tx) =>
      tx.select().from(messages).where(eq(messages.toAddress, 'mary.kelly@example.ie')),
    );
    expect(sent.map((m) => [m.kind, m.status]).sort()).toEqual([
      ['reference_reminder', 'scheduled'],
      ['reference_reminder', 'scheduled'],
      ['reference_request', 'scheduled'],
    ]);
    const request = sent.find((m) => m.kind === 'reference_request')!;
    expect(request.subject).toBe('Reference for Renter 1');

    const landlordToken = refereeToken(request.body);
    expect(await loadReferenceRequest(landlordToken)).toMatchObject({
      kind: 'landlord_reference',
      renterName: 'Renter 1',
    });
    expect(await submitReference(landlordToken, { rentedFromYou: 'yes' })).toMatchObject({
      ok: false,
    });
    expect(
      await submitReference(landlordToken, {
        rentedFromYou: 'yes',
        paidOnTime: 'always',
        lookedAfter: 'yes',
        rentAgain: 'yes',
      }),
    ).toEqual({ ok: true });
    const after = await withOrg(member.organisationId, (tx) =>
      tx.select().from(messages).where(eq(messages.toAddress, 'mary.kelly@example.ie')),
    );
    expect(after.filter((m) => m.kind === 'reference_reminder').map((m) => m.status)).toEqual([
      'cancelled',
      'cancelled',
    ]);
    const results = await withOrg(member.organisationId, (tx) => checkResultsFor(tx, [ids[0]!]));
    expect(results.get(ids[0]!)!.find((c) => c.kind === 'landlord_reference')!.summary).toBe(
      'Rented from them. Rent always on time. Looked after the home. Would rent to them again.',
    );

    // The employer never answers: after two reminders it's flagged.
    const employer = (await checksOfPerson(member, ids[0]!)).find(
      (c) => c.kind === 'employer_reference',
    )!;
    await markReferenceOverdue({ organisationId: member.organisationId, checkId: employer.id });
    expect((await checksOfPerson(member, ids[0]!)).find((c) => c.id === employer.id)!.status).toBe(
      'no_answer',
    );
  });

  it('takes "I haven’t rented before" as an answer', async () => {
    const { member, ids, token } = await chosen();
    await submitReferees(token, { landlordNone: 'yes', employerNone: 'yes' });
    expect(
      (await checksOfPerson(member, ids[0]!))
        .filter((c) => c.kind.endsWith('reference'))
        .map((c) => c.status),
    ).toEqual(['not_needed', 'not_needed']);
  });

  it('deletes check results and referees’ details on schedule, and their links stop working', async () => {
    const { member, lettingId, ids, token } = await chosen();
    await submitReferees(token, {
      landlordName: 'Mary Kelly',
      landlordEmail: 'mary.kelly@example.ie',
      employerNone: 'yes',
    });
    const [request] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.applicationId, ids[0]!), eq(messages.kind, 'reference_request'))),
    );
    const landlordToken = refereeToken(request!.body);
    const { deleteAfter } = await closeLetting(member, lettingId, 'withdrawn');
    await sweepPersonalData(new Date(`${deleteAfter}T12:00:00Z`), member.organisationId);
    const cleared = await checksOfPerson(member, ids[0]!);
    expect(cleared.every((c) => c.refereeName === null && c.refereeEmail === null)).toBe(true);
    expect(await loadReferenceRequest(landlordToken)).toBeNull();
    const links = await withOrg(member.organisationId, (tx) =>
      tx.select().from(accessLinks).where(eq(accessLinks.purpose, 'referee')),
    );
    expect(links.every((l) => l.revokedAt !== null)).toBe(true);
    const [person] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, ids[0]!)),
    );
    expect(person).toMatchObject({ earning: null, monthlyIncomeCents: null });
  });
});
