import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { psraRegister, users } from '@/db/schema';
import type { SensitiveAction } from '@/domain/auth/confirm';
import type { OrganisationKind } from '@/domain/organisations/kinds';
import { searchTextFor } from '@/domain/register/search';
import type { SignedInPerson } from '@/server/accounts/contexts';
import { findConfirmation, grantConfirmation, type Confirmation } from '@/server/auth/confirm';
import { findMember, type Member } from '@/server/auth/member';
export type { Member };
import { createOrganisationIn } from '@/server/organisations/create-organisation';

/** A made-up person who has signed in and done nothing else yet. */
export async function createTestPerson(
  overrides: { name?: string; email?: string; emailVerified?: boolean } = {},
): Promise<SignedInPerson> {
  const id = crypto.randomUUID();
  const person = {
    id,
    name: overrides.name ?? 'Ann Power',
    email: overrides.email ?? `${id}@test.gaff.ie`,
    emailVerified: overrides.emailVerified ?? true,
  };
  await db().insert(users).values(person);
  return person;
}

/** The person as the session would give them now: with the name they've given since. */
export async function reloaded(person: SignedInPerson): Promise<SignedInPerson> {
  const [row] = await db().select().from(users).where(eq(users.id, person.id));
  return { id: row!.id, name: row!.name, email: row!.email, emailVerified: row!.emailVerified };
}

/** A made-up business licensed to let, in Gaff's copy of the PSRA register. */
export async function aRegisterEntry(
  overrides: {
    registeredName?: string;
    tradingName?: string | null;
    licenceNumber?: string;
    county?: string;
  } = {},
) {
  const id = crypto.randomUUID();
  const entry = {
    id,
    // A 9 and fourteen digits from the random ID: no other test has it, no real licence is so
    // long, and it starts with neither the sample register's 0 nor a register test's 4.
    licenceNumber:
      overrides.licenceNumber ??
      `9${String(BigInt(`0x${id.replace(/-/g, '')}`) % 10n ** 14n).padStart(14, '0')}`,
    registeredName: overrides.registeredName ?? `Halcyon ${id.slice(0, 6)} Limited`,
    tradingName: overrides.tradingName === undefined ? null : overrides.tradingName,
    licenceType: 'company',
    county: overrides.county ?? 'Dublin',
  };
  await db()
    .insert(psraRegister)
    .values({ ...entry, searchText: searchTextFor(entry) })
    .onConflictDoUpdate({
      target: psraRegister.licenceNumber,
      set: { removedAt: null, lastSeenAt: sql`now()` },
    });
  const [stored] = await db()
    .select()
    .from(psraRegister)
    .where(eq(psraRegister.licenceNumber, entry.licenceNumber));
  return stored!;
}

/**
 * A signed-up operator with their own organisation, isolated from every other test. An agency is
 * on the register and CONFIRMED unless `confirmed: false` is asked for, so its homes can go live
 * (UX-AG-4); its licence number is 001234, as the agreement and the emails print it, unless
 * `licenceNumber` says otherwise. Pass `kind` for a landlord's team or a private landlord.
 */
export async function createTestMember(
  overrides: {
    name?: string;
    organisation?: string;
    kind?: OrganisationKind;
    confirmed?: boolean;
  } = {},
): Promise<Member> {
  const person = await createTestPerson({ name: overrides.name });
  const kind = overrides.kind ?? 'agency';
  const name = overrides.organisation ?? `Halcyon ${person.id.slice(0, 6)}`;
  const entry = kind === 'agency' ? await aRegisterEntry({ registeredName: name }) : null;
  await db().transaction((tx) =>
    createOrganisationIn(tx, {
      kind,
      name,
      psraRegisterEntryId: entry?.id ?? null,
      // The number tests read in an agreement or an email, not the made-up entry's own.
      psraLicenceNumber: entry ? '001234' : null,
      confirmed: entry && overrides.confirmed !== false ? { at: new Date(), by: null } : null,
      adminUserId: person.id,
      actor: { type: 'person', userId: person.id },
    }),
  );
  const member = await findMember(person.id);
  if (!member) throw new Error('test member was not created');
  return member;
}

/** Test only: the agency as it is once someone at Gaff has confirmed it (UX-AG-4). */
export async function confirmForTest(organisationId: string): Promise<void> {
  const { organisations } = await import('@/db/schema');
  await db()
    .update(organisations)
    .set({ confirmedAt: new Date() })
    .where(eq(organisations.id, organisationId));
}

/**
 * UX-SI-10: the member has just confirmed it's them, as the "Confirm it's you" sheet leaves it.
 * For tests of use cases that spend a confirmation, such as changing where tenants pay.
 */
export async function confirmedAgain(
  member: Member,
  action: SensitiveAction = 'change_payment_account',
): Promise<Confirmation> {
  const grant = await grantConfirmation(member.userId, action, 'email_code');
  const confirmation = await findConfirmation(member.userId, action, grant);
  if (!confirmation) throw new Error('the confirmation was not found');
  return confirmation;
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
  const { lettingId } = await createLetting(member, aLetting(overrides));
  await addViewingSession(member, lettingId, aViewingSession());
  await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true });
  await recordRentCheck(member, lettingId, { lastLet: 'never' }, 185_000);
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
 * UX-DC-19 (R4, Q41): the three comparable rents the offer waits for, made up, for a letting at
 * the usual €1,850 a month.
 */
export async function threeComparables(member: Member, lettingId: string): Promise<void> {
  const { recordComparables } = await import('@/server/lettings/comparables');
  await recordComparables(
    member,
    lettingId,
    [180_000, 185_000, 195_000].map((monthlyRentCents) => ({
      area: 'Dublin 6',
      propertyType: 'apartment' as const,
      bedrooms: 2,
      monthlyRentCents,
    })),
  );
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
  await threeComparables(member, lettingId);
  // UX-DC-19: the person goes ahead before the checks are back.
  const made = await makeOffer(member, lettingId, {
    deposit: '1,850',
    startDate: '2026-12-01',
    deadlineHours: '48',
    withoutChecks: 'yes',
  });
  if (!made.ok) throw new Error(`offer failed: ${JSON.stringify(made)}`);
  const tenantToken = await tokenInMessage(member, ids[0]!, 'offer');
  const accepted = await respondToOffer(tenantToken, 'accept');
  if (!accepted.ok) throw new Error(`accept failed: ${JSON.stringify(accepted)}`);
  return { lettingId, tenantId: ids[0]!, otherId: ids[1]!, tenantToken };
}
