import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg, withSystem } from '@/db/client';
import {
  bookings,
  checks,
  funnelEvents,
  landlordApprovals,
  messages,
  viewingSlots,
} from '@/db/schema';
import { allFunnelReports, type FunnelReport } from '@/domain/funnels/report';
import { recordCutoff } from '@/domain/tenancy/steps';
import { claimAgency } from '@/server/accounts/agencies';
import { ensureOwnHomes } from '@/server/accounts/contexts';
import { submitApplication } from '@/server/applications/apply';
import { chooseApplicants } from '@/server/applications/choose';
import { findMember } from '@/server/auth/member';
import {
  noteSignedIn,
  noteSignInMethodChosen,
  noteSignInScreenOpened,
} from '@/server/auth/sign-in-steps';
import {
  openReferenceRequest,
  recordProviderResult,
  submitReference,
  submitReferees,
} from '@/server/checks/checks';
import { funnelFacts } from '@/server/funnels/report';
import { noteFunnelStep, purgeFunnelEvents, recordFunnelStep } from '@/server/funnels/steps';
import { sendMessage } from '@/server/messages/outbox';
import { answerApproval, askLandlord, openApprovalSummary } from '@/server/offers/approval';
import { makeOffer, respondToOffer } from '@/server/offers/offer';
import { openRenterPage, saveRenterAnswers } from '@/server/renter/answers';
import { inviteToView } from '@/server/shortlist/invite';
import { finishLetting } from '@/server/tenancy/close';
import { confirmPayment, requestPayment, setPaymentAccount } from '@/server/tenancy/payment';
import { markSignedOnPaper } from '@/server/tenancy/tenancy';
import { markAttendance } from '@/server/viewings/attendance';
import { bookViewing } from '@/server/viewings/booking';
import {
  aLiveLetting,
  aRegisterEntry,
  aRenterEnquires,
  confirmedAgain,
  confirmForTest,
  createTestPerson,
  databaseError,
  renterTokenFor,
  tokenInMessage,
  type Member,
} from './helpers';

const stepsOf = (subjectId: string) =>
  withSystem((tx) =>
    tx
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.subjectId, subjectId))
      .orderBy(asc(funnelEvents.id)),
  );

/** Sends everything in the outbox that's due, as the worker would. */
async function deliverDueMessages(member: Member): Promise<void> {
  const due = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.status, 'scheduled'), lte(messages.sendAt, new Date()))),
  );
  for (const message of due) {
    await sendMessage({
      organisationId: member.organisationId,
      messageId: message.id,
      attempt: 1,
      maxAttempts: 10,
    });
  }
}

/** The funnels, counted for these subjects only: other tests share the database. */
async function reportsFor(subjects: string[]): Promise<Map<string, FunnelReport>> {
  const mine = new Set(subjects);
  const facts = (await funnelFacts()).filter((fact) => mine.has(fact.subject));
  return new Map(allFunnelReports(facts).map((report) => [report.code, report]));
}

const reached = (reports: Map<string, FunnelReport>, code: string) =>
  reports.get(code)!.steps.map((step) => step.reached);

describe('UX-ME-1: funnel events', () => {
  it('UX-ME-1: a step is recorded once per subject, however often it happens', async () => {
    const attempt = crypto.randomUUID();
    await noteSignInScreenOpened(attempt);
    await noteSignInScreenOpened(attempt);
    await db().transaction(async (tx) => {
      await recordFunnelStep(tx, { step: 'sign_in.screen_opened', subjectId: attempt });
      await recordFunnelStep(tx, { step: 'sign_in.screen_opened', subjectId: attempt });
    });
    const rows = await stepsOf(attempt);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      step: 'sign_in.screen_opened',
      subjectType: 'attempt',
      variant: null,
      data: {},
    });
  });

  it('UX-ME-1: is saved or dropped with the change it measures', async () => {
    const subjectId = crypto.randomUUID();
    await expect(
      db().transaction(async (tx) => {
        await recordFunnelStep(tx, { step: 'offer.checks_back', subjectId });
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    expect(await stepsOf(subjectId)).toEqual([]);
  });

  it('UX-ME-1: something that isn’t an ID is never written, and the page still loads', async () => {
    await expect(noteSignInScreenOpened('ann@example.ie')).resolves.toBeUndefined();
    await expect(noteSignInMethodChosen('Ann Power', 'email_code')).resolves.toBeUndefined();
    await expect(
      noteFunnelStep({ step: 'referee.opened', subjectId: '+353 87 123 4567' }),
    ).resolves.toBeUndefined();
    const { rows } = await withSystem((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from funnel_events where subject_id::text !~ '^[0-9a-f-]{36}$'`,
      ),
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('UX-ME-1: the database itself refuses a step or a split that isn’t a code', async () => {
    const insert = (step: string, variant: string | null) =>
      db().execute(
        sql`insert into funnel_events (step, subject_type, subject_id, variant) values (${step}, 'attempt', ${crypto.randomUUID()}, ${variant})`,
      );
    expect(await databaseError(insert('Ann Power', null))).toContain('funnel_events_step_is_code');
    expect(await databaseError(insert('sign_in.method_chosen', 'ann@example.ie'))).toContain(
      'funnel_events_variant_is_code',
    );
    expect(
      await databaseError(
        db().execute(
          sql`insert into funnel_events (step, subject_type, subject_id) values ('sign_in.signed_in', 'attempt', 'Ann Power')`,
        ),
      ),
    ).toContain('invalid input syntax for type uuid');
  });

  it('UX-ME-2: only the system path reads funnel events, and nobody can change one', async () => {
    const member = await createMember();
    const subjectId = crypto.randomUUID();
    await withOrg(member.organisationId, (tx) =>
      recordFunnelStep(tx, { step: 'renter_questions.page_opened', subjectId }),
    );
    // An operator's queries (withOrg) and a query with no scope at all see nothing.
    expect(await withOrg(member.organisationId, (tx) => tx.select().from(funnelEvents))).toEqual(
      [],
    );
    expect(await db().select().from(funnelEvents)).toEqual([]);
    expect(await stepsOf(subjectId)).toHaveLength(1);

    // There's no way to change a row, even for the system.
    const moved = new Date('2020-01-01T00:00:00Z');
    const change = (tx: Parameters<Parameters<typeof withSystem>[0]>[0]) =>
      tx
        .update(funnelEvents)
        .set({ occurredAt: moved })
        .where(eq(funnelEvents.subjectId, subjectId))
        .returning({ id: funnelEvents.id });
    expect(await withOrg(member.organisationId, change)).toEqual([]);
    expect(await withSystem(change)).toEqual([]);
    const deleted = await withOrg(member.organisationId, (tx) =>
      tx
        .delete(funnelEvents)
        .where(eq(funnelEvents.subjectId, subjectId))
        .returning({ id: funnelEvents.id }),
    );
    expect(deleted).toEqual([]);
    expect(await stepsOf(subjectId)).toHaveLength(1);
  });

  it('UX-ME-1: old funnel events are deleted with the rest of the anonymous record', async () => {
    const old = crypto.randomUUID();
    const recent = crypto.randomUUID();
    const twoYearsAgo = new Date(Date.now() - 730 * 86_400_000);
    await noteFunnelStep({ step: 'owner.opened', subjectId: old, occurredAt: twoYearsAgo });
    await noteFunnelStep({ step: 'owner.opened', subjectId: recent });
    const gone = await withSystem((tx) => purgeFunnelEvents(tx, recordCutoff(new Date(), 12)));
    expect(gone).toBeGreaterThanOrEqual(1);
    expect(await stepsOf(old)).toEqual([]);
    expect(await stepsOf(recent)).toHaveLength(1);
  });
});

/** A new person signs in and sets up, as the screens do it, so both funnels have their steps. */
async function createMember(kind: 'agency' | 'private_landlord' = 'agency') {
  const person = await createTestPerson();
  const attempt = crypto.randomUUID();
  await noteSignInScreenOpened(attempt);
  await noteSignInMethodChosen(attempt, 'email_code');
  await noteSignedIn(attempt, { id: person.id }, 'email_code');
  if (kind === 'agency') {
    const claimed = await claimAgency(person, (await aRegisterEntry()).id);
    if (claimed.result !== 'created') throw new Error('the agency was not set up');
    await confirmForTest(claimed.organisationId);
  } else {
    await ensureOwnHomes(person);
  }
  const member = await findMember(person.id);
  if (!member) throw new Error('test member was not created');
  return Object.assign(member, { attempt });
}

describe('UX-ME-2: the funnels, from the record’s events and the new steps', () => {
  it('UX-ME-2: signing in again doesn’t start first run again', async () => {
    const member = await createMember('private_landlord');
    const again = crypto.randomUUID();
    await noteSignInScreenOpened(again);
    await noteSignInMethodChosen(again, 'email_code');
    await noteSignedIn(again, { id: member.userId }, 'email_code');
    // A third try: the screen is opened and left.
    const left = crypto.randomUUID();
    await noteSignInScreenOpened(left);

    const reports = await reportsFor([member.attempt, again, left, member.userId]);
    expect(reached(reports, 'sign_in')).toEqual([3, 2, 2]);
    expect(reports.get('sign_in')!.steps[2]).toMatchObject({ fromPrevious: 1, fromFirst: 2 / 3 });
    expect(reports.get('sign_in')!.split).toEqual({
      label: 'Method',
      rows: [
        { variant: 'email_code', reached: [2, 2, 2] },
        { variant: null, reached: [1, 0, 0] },
      ],
    });
    expect(reached(reports, 'first_run')).toEqual([1, 1]);
    expect(reports.get('first_run')!.split!.rows).toEqual([
      { variant: 'private_landlord', reached: [1, 1] },
    ]);
    expect(reports.get('first_run')!.steps[1]!.medianMs).toBeGreaterThanOrEqual(0);
  });

  it('UX-ME-2: a whole letting gives every existing flow’s funnel its numbers', async () => {
    const member = await createMember();
    const { lettingId } = await aLiveLetting(member);

    // Three renters enquire. Two open their page and answer; one never opens it.
    const renters = [
      await aRenterEnquires(member, 1),
      await aRenterEnquires(member, 2),
      await aRenterEnquires(member, 3),
    ];
    const [first, second] = renters as [string, string, string];
    await deliverDueMessages(member);
    for (const id of [first, second]) {
      const token = await renterTokenFor(member, id);
      expect(await openRenterPage(token)).not.toBeNull();
      // Opening it again, or refreshing, isn't a second step.
      await openRenterPage(token);
      const saved = await saveRenterAnswers(token, { occupants: '1', hasPets: 'no' });
      expect(saved).toEqual({ ok: true });
      await openRenterPage(token);
    }
    expect((await stepsOf(first)).map((row) => row.step)).toEqual(['renter_questions.page_opened']);

    // Who views is decided; both book.
    await inviteToView(member, lettingId, { chosenIds: [first, second], waitlistSize: 0 });
    await deliverDueMessages(member);
    const slots = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(viewingSlots)
        .where(eq(viewingSlots.lettingId, lettingId))
        .orderBy(asc(viewingSlots.startsAt)),
    );
    for (const [i, id] of [first, second].entries()) {
      const token = await tokenInMessage(member, id, 'invitation');
      await openRenterPage(token);
      expect(await bookViewing(token, slots[i]!.id)).toMatchObject({ ok: true });
      await openRenterPage(token);
    }

    // They come, are invited to apply, open that and apply.
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(viewingSlots)
        .set({
          startsAt: new Date(Date.now() - 30 * 60_000),
          endsAt: new Date(Date.now() - 15 * 60_000),
        })
        .where(eq(viewingSlots.lettingId, lettingId)),
    );
    for (const id of [first, second]) {
      const [booking] = await withOrg(member.organisationId, (tx) =>
        tx
          .select()
          .from(bookings)
          .where(and(eq(bookings.applicationId, id), eq(bookings.status, 'booked'))),
      );
      await markAttendance(member, { lettingId, bookingId: booking!.id, attended: true });
    }
    await deliverDueMessages(member);
    for (const id of [first, second]) {
      const token = await tokenInMessage(member, id, 'apply_invitation');
      await openRenterPage(token);
      expect(
        await submitApplication(token, { earning: 'employed', monthlyIncome: '5200' }),
      ).toEqual({ ok: true });
    }

    // Applicants are chosen; the preferred one does their checks and both referees answer.
    await chooseApplicants(member, lettingId, { preferredId: first, backupId: second });
    const checksToken = await tokenInMessage(member, first, 'checks_invitation');
    await openRenterPage(checksToken);
    const theirChecks = () =>
      withOrg(member.organisationId, (tx) =>
        tx.select().from(checks).where(eq(checks.applicationId, first)),
      );
    const check = async (kind: string) => (await theirChecks()).find((c) => c.kind === kind)!;
    await recordProviderResult((await check('identity')).id, {
      kind: 'identity',
      result: { verified: true, verifiedName: 'Renter 1' },
    });
    await recordProviderResult((await check('income')).id, {
      kind: 'income',
      result: { confirmed: true, monthlyIncomeCents: 520_000 },
    });
    // Not done yet: no referees named.
    expect((await stepsOf(first)).map((row) => row.step)).not.toContain('renter_checks.all_done');
    expect(
      await submitReferees(checksToken, {
        landlordName: 'Mary Kelly',
        landlordEmail: 'mary.kelly@example.ie',
        employerName: 'Seán Daly',
        employerEmail: 'sean.daly@example.ie',
      }),
    ).toEqual({ ok: true });
    expect((await stepsOf(first)).map((row) => row.step)).toContain('renter_checks.all_done');
    expect(await stepsOf(lettingId)).toEqual([]);
    await deliverDueMessages(member);
    const requests = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, 'reference_request'))),
    );
    const refereeToken = (kind: string, checkId: string) =>
      /\/reference\/([A-Za-z0-9_-]{43})/.exec(
        requests.find((m) => m.checkId === checkId)?.body ?? `no request for ${kind}`,
      )![1]!;
    const landlordCheck = await check('landlord_reference');
    const employerCheck = await check('employer_reference');
    // The previous landlord opens the form (twice) and answers. The employer answers too.
    const landlordToken = refereeToken('landlord', landlordCheck.id);
    expect(await openReferenceRequest(landlordToken)).toMatchObject({ kind: 'landlord_reference' });
    await openReferenceRequest(landlordToken);
    expect(
      await submitReference(landlordToken, {
        rentedFromYou: 'yes',
        paidOnTime: 'always',
        lookedAfter: 'yes',
        rentAgain: 'yes',
      }),
    ).toEqual({ ok: true });
    expect(await stepsOf(lettingId)).toEqual([]);
    expect(
      await submitReference(refereeToken('employer', employerCheck.id), {
        worksForYou: 'yes',
        contract: 'permanent',
        howLong: 'over_3',
      }),
    ).toEqual({ ok: true });
    expect((await stepsOf(lettingId)).map((row) => row.step)).toEqual(['offer.checks_back']);

    // The owner opens the link and approves; the offer goes out and is accepted.
    await askLandlord(member, lettingId);
    await deliverDueMessages(member);
    const [ask] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, 'landlord_approval'))),
    );
    const approvalToken = /\/approve\/([A-Za-z0-9_-]{43})/.exec(ask!.body)![1]!;
    expect(await openApprovalSummary(approvalToken)).not.toBeNull();
    await openApprovalSummary(approvalToken);
    await answerApproval(approvalToken, { preferred: 'approve', backup: 'approve' });
    expect(
      await makeOffer(member, lettingId, {
        deposit: '1,850',
        startDate: '2026-12-01',
        deadlineHours: '48',
      }),
    ).toEqual({ ok: true });
    await deliverDueMessages(member);
    const offerToken = await tokenInMessage(member, first, 'offer');
    await openRenterPage(offerToken);
    expect(await respondToOffer(offerToken, 'accept')).toMatchObject({ ok: true });

    // The tenancy: signed, paid and finished.
    await markSignedOnPaper(member, lettingId);
    await setPaymentAccount(
      member,
      { accountName: 'Client account', iban: 'IE29AIBK93115212345678' },
      await confirmedAgain(member),
    );
    await requestPayment(member, lettingId, { dueDate: '2026-11-28' });
    await confirmPayment(member, lettingId);
    await finishLetting(member, lettingId);

    const ids = await withOrg(member.organisationId, async (tx) => [
      ...(await tx
        .select({ id: checks.id })
        .from(checks)
        .where(inArray(checks.applicationId, renters))),
      ...(await tx
        .select({ id: landlordApprovals.id })
        .from(landlordApprovals)
        .where(eq(landlordApprovals.lettingId, lettingId))),
    ]);
    const reports = await reportsFor([
      member.attempt,
      member.userId,
      member.organisationId,
      lettingId,
      ...renters,
      ...ids.map((row) => row.id),
    ]);

    expect(reached(reports, 'sign_in')).toEqual([1, 1, 1]);
    expect(reached(reports, 'first_run')).toEqual([1, 1]);
    // Reviewing the draft isn't a separate step in today's product.
    expect(reached(reports, 'add_letting')).toEqual([1, 0, 1]);
    expect(reached(reports, 'activation')).toEqual([1, 1]);
    expect(reached(reports, 'first_decision')).toEqual([1, 1]);
    expect(reached(reports, 'offer')).toEqual([1, 1, 1]);
    expect(reached(reports, 'enquiry_sources')).toEqual([3]);
    expect(reports.get('enquiry_sources')!.split!.rows).toEqual([
      { variant: 'daft', reached: [3] },
    ]);
    expect(reached(reports, 'renter_questions')).toEqual([3, 2, 2]);
    expect(reached(reports, 'renter_booking')).toEqual([2, 2, 2]);
    expect(reached(reports, 'renter_applying')).toEqual([2, 2, 2]);
    expect(reached(reports, 'renter_checks')).toEqual([2, 1]);
    expect(reached(reports, 'renter_offer')).toEqual([1, 1]);
    expect(reached(reports, 'referee')).toEqual([2, 1, 2]);
    expect(reached(reports, 'owner')).toEqual([1, 1, 1]);
    expect(reached(reports, 'letting')).toEqual([1, 1, 1, 1, 1]);
    // Registering with the RTB wasn't done in this run.
    expect(reached(reports, 'tenancy')).toEqual([1, 1, 1, 0, 1]);

    // UX-LT-20: the portal's enquiries arrived, so forwarding is in place; nobody opened the flow.
    expect(reached(reports, 'forwarding')).toEqual([0, 1, 0]);

    // Flows that aren't built yet have their steps and no numbers.
    expect(reached(reports, 'on_gaff')).toEqual([1, 0]);
    expect(reached(reports, 'invite_team')).toEqual([1, 0, 0]);
    for (const code of ['import', 'home', 'search', 'ask_to_view', 'saved_search', 'profile']) {
      expect(
        reached(reports, code).every((n) => n === 0),
        code,
      ).toBe(true);
    }

    expect(reports.get('renter_questions')!.steps.map((step) => step.fromPrevious)).toEqual([
      null,
      2 / 3,
      1,
    ]);
    for (const [funnel, step] of [
      ['add_letting', 2],
      ['first_decision', 1],
      ['renter_questions', 2],
      ['renter_booking', 2],
      ['renter_checks', 1],
      ['referee', 2],
      ['owner', 2],
      ['letting', 4],
    ] as const) {
      expect(reports.get(funnel)!.steps[step]!.medianMs, funnel).toBeGreaterThanOrEqual(0);
    }

    // What was written holds IDs, codes and times only.
    const written = await withSystem((tx) =>
      tx
        .select()
        .from(funnelEvents)
        .where(
          inArray(funnelEvents.subjectId, [member.attempt, member.userId, lettingId, ...renters]),
        ),
    );
    expect(written.length).toBeGreaterThan(8);
    const text = JSON.stringify(written);
    for (const personal of ['Renter', 'Ann', 'Halcyon', 'Ranelagh', 'Kelly', '@']) {
      expect(text).not.toContain(personal);
    }
  }, 60_000);
});
