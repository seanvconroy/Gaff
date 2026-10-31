import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg } from '@/db/client';
import { applications, events, messages } from '@/db/schema';
import { loadRenterPage, saveRenterAnswers } from '@/server/renter/answers';
import { daftEnquiry } from '../fixtures/emails';
import { daysFromToday } from '../fixtures/lettings';
import { aLiveLetting, createTestMember, deliverEmail } from './helpers';

/** The private link in the renter's first reply, as they'd click it. */
async function renterToken(organisationId: string, applicationId: string): Promise<string> {
  const [reply] = await withOrg(organisationId, (tx) =>
    tx
      .select({ body: messages.body })
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply'))),
  );
  return /\/r\/([A-Za-z0-9_-]{43})/.exec(reply!.body)![1]!;
}

async function aRenter() {
  const member = await createTestMember();
  await aLiveLetting(member); // criteria: up to 3 people, no pets
  const outcome = await deliverEmail(member, daftEnquiry);
  if (outcome.kind !== 'enquiry') throw new Error('expected an enquiry');
  const token = await renterToken(member.organisationId, outcome.applicationId);
  return { member, applicationId: outcome.applicationId, token };
}

describe('R9: the renter answers on a private page, with no account', () => {
  it('shows the home and only the questions the criteria need', async () => {
    const { token } = await aRenter();
    const page = await loadRenterPage(token);
    expect(page?.letting.addressLine1).toBe('12 Ranelagh Road');
    expect(page?.questions).toEqual(['occupants', 'hasPets']);
    expect(page?.canChange).toBe(true);
  });

  it('saves the answers, keeping only what was asked, and records it without them', async () => {
    const { member, applicationId, token } = await aRenter();
    const result = await saveRenterAnswers(token, {
      occupants: '2',
      hasPets: 'no',
      moveInDate: daysFromToday(20),
      familyStatus: 'two children',
    });
    expect(result).toEqual({ ok: true });
    const [application] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.id, applicationId)),
    );
    expect(application?.answers).toEqual({ occupants: 2, hasPets: false });
    const [event] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(events).where(eq(events.type, 'application.answered')),
    );
    expect(event).toMatchObject({
      actorType: 'renter',
      data: { applicationId, questions: 2, changed: false },
    });
  });

  it('explains what’s missing', async () => {
    const { token } = await aRenter();
    expect(await saveRenterAnswers(token, { occupants: '2' })).toEqual({
      ok: false,
      errors: { hasPets: 'Choose whether you have any pets' },
    });
  });

  it('locks the answers once the operator has decided who to invite', async () => {
    const { member, applicationId, token } = await aRenter();
    await withOrg(member.organisationId, (tx) =>
      tx.update(applications).set({ status: 'invited' }).where(eq(applications.id, applicationId)),
    );
    expect(await saveRenterAnswers(token, { occupants: '1', hasPets: 'no' })).toEqual({
      ok: false,
      locked: true,
    });
  });

  it('refuses a made-up or tampered link', async () => {
    const { token } = await aRenter();
    expect(await loadRenterPage('x'.repeat(43))).toBeNull();
    expect(
      await loadRenterPage(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`),
    ).toBeNull();
    expect(await saveRenterAnswers('not-a-token', { occupants: '1' })).toBeNull();
  });
});
