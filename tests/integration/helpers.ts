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
