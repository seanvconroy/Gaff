import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { findMember, type Member } from '@/server/auth/member';
export type { Member };
import { createOrganisation } from '@/server/organisations/create-organisation';

/** A signed-up operator with their own organisation, isolated from every other test. */
export async function createTestMember(
  overrides: { name?: string; organisation?: string; kind?: 'agency' | 'landlord' } = {},
): Promise<Member> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({ id, name: 'pending', email: `${id}@test.gaff.ie`, emailVerified: true });
  const kind = overrides.kind ?? 'agency';
  await createOrganisation(id, {
    yourName: overrides.name ?? 'Ann Power',
    name: overrides.organisation ?? `Halcyon ${id.slice(0, 6)}`,
    kind,
    psraLicenceNumber: kind === 'agency' ? '001234' : undefined,
  });
  const member = await findMember(id);
  if (!member) throw new Error('test member was not created');
  return member;
}

/** The database's own message for a failed query (Drizzle wraps it as the error's cause). */
export async function databaseError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error('expected the database to refuse this');
}

/** Payloads of queued jobs for a task (graphile-worker keeps payloads in a private table). */
export async function queuedJobs(task: string): Promise<Array<Record<string, unknown>>> {
  const { rows } = await db().execute<{ payload: Record<string, unknown> }>(sql`
    select j.payload from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${task}`);
  return rows.map((row) => row.payload);
}

/** A letting that's set up and taking enquiries (stage 2). */
export async function aLiveLetting(
  member: Member,
  overrides: Partial<Record<string, string>> = {},
) {
  const { aLetting, aViewingSession } = await import('../fixtures/lettings');
  const { createLetting } = await import('@/server/lettings/create-letting');
  const { addViewingSession } = await import('@/server/lettings/viewing-sessions');
  const { setCriteria } = await import('@/server/lettings/set-criteria');
  const { recordRentCheck } = await import('@/server/lettings/rent-check');
  const { startTakingEnquiries } = await import('@/server/lettings/go-live');
  const letting = aLetting(overrides);
  const { lettingId } = await createLetting(member, letting);
  await addViewingSession(member, lettingId, aViewingSession());
  await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true });
  await recordRentCheck(member, lettingId, { lastLet: 'never' }, letting.rent);
  await startTakingEnquiries(member, lettingId);
  return { lettingId };
}

/** Receives a synthetic email at the member's Gaff address and processes it, as the worker would. */
export async function deliverEmail(
  member: Member,
  email: { from: string; replyTo?: string; subject: string; text: string },
  to?: string,
) {
  const { eq } = await import('drizzle-orm');
  const { organisations, inboundEmails } = await import('@/db/schema');
  const { withOrg } = await import('@/db/client');
  const { receiveInboundEmail } = await import('@/server/enquiries/receive');
  const { processInboundEmail } = await import('@/server/enquiries/process');
  const [org] = await db()
    .select({ slug: organisations.inboundSlug })
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  const providerMessageId = `<${crypto.randomUUID()}@test>`;
  await receiveInboundEmail({
    provider: 'dev',
    providerMessageId,
    recipient: to ?? `${org!.slug}@in.gaff.test`,
    from: email.from,
    replyTo: email.replyTo,
    subject: email.subject,
    text: email.text,
    receivedAt: new Date(),
  });
  const [stored] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: inboundEmails.id })
      .from(inboundEmails)
      .where(eq(inboundEmails.providerMessageId, providerMessageId)),
  );
  return processInboundEmail({ organisationId: member.organisationId, inboundEmailId: stored!.id });
}

/** The private link token in a renter's first reply, as they'd click it. */
export async function renterTokenFor(member: Member, applicationId: string): Promise<string> {
  const { and, eq } = await import('drizzle-orm');
  const { messages } = await import('@/db/schema');
  const { withOrg } = await import('@/db/client');
  const [reply] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ body: messages.body })
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply'))),
  );
  return /\/r\/([A-Za-z0-9_-]{43})/.exec(reply!.body)![1]!;
}

/** A new renter enquires (unique email and phone) and, optionally, answers the questions. */
export async function aRenterEnquires(
  member: Member,
  n: number,
  answers?: Record<string, string>,
): Promise<string> {
  const { daftEnquiry } = await import('../fixtures/emails');
  const { saveRenterAnswers } = await import('@/server/renter/answers');
  const email = `renter${n}.${crypto.randomUUID().slice(0, 6)}@example.ie`;
  const phone = `087 ${String(1000000 + n * 7919).slice(0, 3)} ${String(1000 + n).slice(-4)}`;
  const outcome = await deliverEmail(member, {
    ...daftEnquiry,
    replyTo: `Renter ${n} <${email}>`,
    text: daftEnquiry.text
      .replace('Aoife Byrne', `Renter ${n}`)
      .replace('aoife.byrne@example.ie', email)
      .replace('087 123 4567', phone)
      .replace(
        'Hi, is the apartment still available? Is there parking?',
        'I would love to view it.',
      ),
  });
  if (outcome.kind !== 'enquiry') throw new Error(`expected a new enquiry, got ${outcome.kind}`);
  if (answers) {
    const result = await saveRenterAnswers(
      await renterTokenFor(member, outcome.applicationId),
      answers,
    );
    if (!result?.ok) throw new Error(`answers not saved: ${JSON.stringify(result)}`);
  }
  return outcome.applicationId;
}

/** The private link token in the newest message of a kind sent to a renter. */
export async function tokenInMessage(
  member: Member,
  applicationId: string,
  kind: string,
): Promise<string> {
  const { and, desc, eq } = await import('drizzle-orm');
  const { messages } = await import('@/db/schema');
  const { withOrg } = await import('@/db/client');
  const [message] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ body: messages.body })
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, kind)))
      .orderBy(desc(messages.createdAt))
      .limit(1),
  );
  return /\/r\/([A-Za-z0-9_-]{43})/.exec(message!.body)![1]!;
}

/**
 * Slice 2 set-up: a live letting where each renter enquired, was invited, booked their own
 * slot, came (the viewings are moved to have just started) and applied with the given
 * take-home income. Returns their application IDs in enquiry order.
 */
export async function peopleWhoApplied(
  member: Member,
  incomes: number[],
): Promise<{ lettingId: string; ids: string[] }> {
  const { and, asc, eq } = await import('drizzle-orm');
  const { withOrg } = await import('@/db/client');
  const { bookings, viewingSlots } = await import('@/db/schema');
  const { inviteToView } = await import('@/server/shortlist/invite');
  const { bookViewing } = await import('@/server/viewings/booking');
  const { markAttendance } = await import('@/server/viewings/attendance');
  const { submitApplication } = await import('@/server/applications/apply');
  const { lettingId } = await aLiveLetting(member);
  const ids: string[] = [];
  for (const [i] of incomes.entries()) {
    ids.push(await aRenterEnquires(member, i + 1, { occupants: '1', hasPets: 'no' }));
  }
  await inviteToView(member, lettingId, { chosenIds: ids, waitlistSize: 0 });
  const slots = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, lettingId))
      .orderBy(asc(viewingSlots.startsAt)),
  );
  for (const [i, id] of ids.entries()) {
    const token = await tokenInMessage(member, id, 'invitation');
    const booked = await bookViewing(token, slots[i]!.id);
    if (!booked.ok) throw new Error(`booking failed: ${JSON.stringify(booked)}`);
  }
  await withOrg(member.organisationId, (tx) =>
    tx
      .update(viewingSlots)
      .set({
        startsAt: new Date(Date.now() - 30 * 60_000),
        endsAt: new Date(Date.now() - 15 * 60_000),
      })
      .where(eq(viewingSlots.lettingId, lettingId)),
  );
  for (const [i, id] of ids.entries()) {
    const [booking] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(bookings)
        .where(and(eq(bookings.applicationId, id), eq(bookings.status, 'booked'))),
    );
    await markAttendance(member, { lettingId, bookingId: booking!.id, attended: true });
    const token = await tokenInMessage(member, id, 'apply_invitation');
    const applied = await submitApplication(token, {
      earning: 'employed',
      monthlyIncome: String(incomes[i]),
    });
    if (!applied?.ok) throw new Error(`apply failed: ${JSON.stringify(applied)}`);
  }
  return { lettingId, ids };
}

/**
 * Slice 3 set-up: a let home. Two applied; the first was chosen, the landlord approved by link,
 * the offer went out and was accepted. Returns the tenant's application ID and a fresh token.
 */
export async function aLetHome(member: Member): Promise<{
  lettingId: string;
  tenantId: string;
  otherId: string;
  tenantToken: string;
}> {
  const { and, eq } = await import('drizzle-orm');
  const { withOrg } = await import('@/db/client');
  const { messages } = await import('@/db/schema');
  const { chooseApplicants } = await import('@/server/applications/choose');
  const { answerApproval, askLandlord } = await import('@/server/offers/approval');
  const { makeOffer, respondToOffer } = await import('@/server/offers/offer');
  const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800]);
  await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
  await askLandlord(member, lettingId);
  const [ask] = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, 'landlord_approval'))),
  );
  await answerApproval(/\/approve\/([A-Za-z0-9_-]{43})/.exec(ask!.body)![1]!, {
    preferred: 'approve',
    backup: 'approve',
  });
  const made = await makeOffer(member, lettingId, {
    deposit: '1,850',
    startDate: '2026-12-01',
    deadlineHours: '48',
  });
  if (!made.ok) throw new Error(`offer failed: ${JSON.stringify(made)}`);
  const tenantToken = await tokenInMessage(member, ids[0]!, 'offer');
  const accepted = await respondToOffer(tenantToken, 'accept');
  if (!accepted.ok) throw new Error(`accept failed: ${JSON.stringify(accepted)}`);
  return { lettingId, tenantId: ids[0]!, otherId: ids[1]!, tenantToken };
}
