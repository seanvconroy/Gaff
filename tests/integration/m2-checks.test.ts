import { and, desc, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { devOutbox, events, letterChecks, staffMembers, users } from '@/db/schema';
import { findStaff, type Staff } from '@/server/auth/staff';
import { licenceQueue, decideLicenceCheck } from '@/server/verification/licence';
import { confirmMobileCode, sendMobileCode } from '@/server/verification/mobile';
import { letterReadiness } from '@/server/verification/readiness';
import { handleIdentityEvent } from '@/server/identity/identity';
import { startIdentityCheck } from '@/server/verification/identity';
import { checkIdIn, checkIdentity } from './identity-helpers';
import { setPaymentAccount } from '@/server/tenancy/payment';
import { createTestMember, queuedJobs, type Member } from './helpers';

async function aStaffMember(): Promise<Staff> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({ id, name: 'Gaff reviewer', email: `${id}@staff.gaff.test`, emailVerified: true });
  await db().insert(staffMembers).values({ userId: id, role: 'reviewer' });
  return (await findStaff(id))!;
}

/** The newest SMS code sent to a number, from the development outbox. */
async function lastCode(phone: string): Promise<string> {
  const [sms] = await db()
    .select({ text: devOutbox.text })
    .from(devOutbox)
    .where(and(eq(devOutbox.toAddress, phone), like(devOutbox.text, '%Gaff code%')))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  return /(\d{6})/.exec(sms!.text)![1]!;
}

async function confirmAMobile(member: Member, phone = `087${String(Math.random()).slice(2, 9)}`) {
  const sent = await sendMobileCode(member.userId, phone);
  expect(sent.ok).toBe(true);
  const e164 = `+353${phone.slice(1)}`;
  expect(await confirmMobileCode(member.userId, await lastCode(e164))).toEqual({ ok: true });
}

describe('M3: confirming a mobile', () => {
  it('texts a code and confirms the number with it', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    const sent = await sendMobileCode(member.userId, '087 555 0101');
    expect(sent).toEqual({ ok: true, masked: '087 ••• 0101' });
    expect(await confirmMobileCode(member.userId, '000000')).toEqual({
      ok: false,
      problem: 'wrong',
    });
    expect(await confirmMobileCode(member.userId, await lastCode('+353875550101'))).toEqual({
      ok: true,
    });
    expect((await letterReadiness(member)).mobile).toBe('+353875550101');
  });

  it('refuses a second code within 30 seconds, and anything that isn’t a mobile', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    expect(await sendMobileCode(member.userId, '01 234 5678')).toEqual({
      ok: false,
      problem: 'invalid',
    });
    await sendMobileCode(member.userId, '087 555 0102');
    expect(await sendMobileCode(member.userId, '087 555 0102')).toEqual({
      ok: false,
      problem: 'too_soon',
    });
  });

  it('locks the code after five wrong tries', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    await sendMobileCode(member.userId, '087 555 0103');
    for (let i = 0; i < 5; i++) await confirmMobileCode(member.userId, '000000');
    expect(await confirmMobileCode(member.userId, await lastCode('+353875550103'))).toEqual({
      ok: false,
      problem: 'locked',
    });
  });
});

describe('M22, M24, P15: a letter’s identity, checked once as a person', () => {
  it('starts the check, records the result and the name only, and is then ready', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
    expect((await letterReadiness(member)).missing).toEqual(['mobile', 'identity']);
    await confirmAMobile(member);
    const checkId = await checkIdentity(member.userId, { returnTo: 'letter' });

    const readiness = await letterReadiness(member);
    expect(readiness.missing).toEqual([]);
    const [copy] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(letterChecks)
        .where(and(eq(letterChecks.userId, member.userId), eq(letterChecks.method, 'id_document'))),
    );
    // The workspace's copy: the result, the name and the date, never the provider's session.
    expect(copy).toMatchObject({ status: 'passed', verifiedName: 'Mary Walsh', providerRef: null });
    // The stand-in holds no documents, so nothing is queued for the provider to delete.
    expect(await queuedJobs('redact_identity')).not.toContainEqual(
      expect.objectContaining({ checkId }),
    );
  });

  it('P15: agents check their identity too', async () => {
    const agent = await createTestMember({ kind: 'agency', verified: false });
    expect((await letterReadiness(agent)).missing).toContain('identity');
    await checkIdentity(agent.userId, { returnTo: 'letter' });
    expect((await letterReadiness(agent)).missing).not.toContain('identity');
  });

  it('P18: the selfie needs the person’s explicit agreement first', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
    await expect(startIdentityCheck(member, { consented: false })).rejects.toThrow(
      /agree to the selfie/,
    );
  });

  it('ignores webhooks for sessions that aren’t the check’s own', async () => {
    const member = await createTestMember({ kind: 'landlord', verified: false });
    const { redirectUrl } = await startIdentityCheck(member, { consented: true });
    const checkId = checkIdIn(redirectUrl);
    expect(
      await handleIdentityEvent({
        type: 'identity.verification_session.verified',
        data: {
          object: {
            id: 'vs_someone_else',
            metadata: { user_id: member.userId, check_id: checkId },
          },
        },
      }),
    ).toBe('ignored');
  });

  it('M30: the payment account must be in the checked name', async () => {
    const member = await createTestMember({ kind: 'landlord' });
    const iban = 'IE29AIBK93115212345678';
    const wrong = await setPaymentAccount(member, { accountName: 'John Smith', iban });
    expect(wrong).toMatchObject({
      ok: false,
      errors: { accountName: expect.stringMatching(/Mary Walsh/) },
    });
    expect(await setPaymentAccount(member, { accountName: 'Mary B Walsh', iban })).toEqual({
      ok: true,
    });
  });
});

describe('M23, M105: licences checked by a person at Gaff', () => {
  it('an agency’s licence goes to the queue when it signs up, and staff decide it', async () => {
    const agency = await createTestMember({ kind: 'agency', verified: false });
    const staff = await aStaffMember();
    const queued = (await licenceQueue(staff)).find(
      (q) => q.organisationId === agency.organisationId,
    );
    expect(queued).toMatchObject({ licenceNumber: '001234', agentName: null, status: 'pending' });

    await decideLicenceCheck(staff, queued!.checkId, { outcome: 'passed' });
    const after = await letterReadiness(agency);
    expect(after.missing).toEqual(['mobile', 'identity', 'agent_licence']);
    expect(after.organisation[0]).toMatchObject({ status: 'passed', licenceNumber: '001234' });
    await expect(decideLicenceCheck(staff, queued!.checkId, { outcome: 'passed' })).rejects.toThrow(
      /already decided/,
    );

    const logged = await withOrg(agency.organisationId, (tx) =>
      tx
        .select({ actorType: events.actorType, data: events.data })
        .from(events)
        .where(eq(events.type, 'letter_check.decided')),
    );
    expect(logged).toEqual([
      {
        actorType: 'staff',
        data: { checkId: queued!.checkId, method: 'psra_register', outcome: 'passed' },
      },
    ]);
  });

  it('without staff rights, nobody sees another organisation’s checks', async () => {
    const a = await createTestMember({ kind: 'agency' });
    const b = await createTestMember({ kind: 'agency' });
    const seenByB = await withOrg(b.organisationId, (tx) =>
      tx.select().from(letterChecks).where(eq(letterChecks.organisationId, a.organisationId)),
    );
    expect(seenByB).toEqual([]);
    expect(await db().select().from(letterChecks)).toEqual([]);
  });
});
