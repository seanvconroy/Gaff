import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { UNDELIVERABLE_DOMAIN } from '@/adapters/email/dev-outbox';
import { db, withOrg } from '@/db/client';
import { applications, devOutbox, events, inboundEmails } from '@/db/schema';
import { dashboardFor } from '@/server/dashboard/dashboard';
import {
  confirmationFor,
  forwardingFor,
  forwardingStillToDoFor,
  sendForwardingTest,
  testReplyFor,
} from '@/server/enquiries/forwarding';
import { setAdvertisedOn } from '@/server/lettings/go-live';
import {
  daftEnquiry,
  gmailForwardingConfirmation,
  myhomeEnquiry,
  outlookForwardingConfirmation,
} from '../fixtures/emails';
import { aLiveLetting, createTestMember, deliverEmail, type Member } from './helpers';

/** Work package WP-11: forwarding enquiries (section 4 of the UX redesign). */

/** The test enquiry the development outbox "sent" to this address. */
async function testEmailTo(to: string) {
  const [sent] = await db()
    .select()
    .from(devOutbox)
    .where(eq(devOutbox.toAddress, to))
    .orderBy(desc(devOutbox.createdAt))
    .limit(1);
  if (!sent) throw new Error(`No test enquiry went to ${to}`);
  return sent;
}

/** What a person's forwarding rule does: the email arrives at their Gaff address, as it was. */
async function forwardedBack(
  member: Member,
  sent: { fromAddress: string; subject: string; text: string },
) {
  return deliverEmail(member, { from: sent.fromAddress, subject: sent.subject, text: sent.text });
}

async function organisationEvents(member: Member) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ type: events.type, data: events.data, actorType: events.actorType })
      .from(events)
      .where(eq(events.organisationId, member.organisationId))
      .orderBy(events.occurredAt),
  );
}

describe('UX-LT-18: the confirmation code or link, read out of the mail service’s email', () => {
  it('UX-LT-18: shows the confirmation for the chosen service once it arrives, and nothing before', async () => {
    const member = await createTestMember();
    expect(await confirmationFor(member, 'gmail')).toBeNull();
    await deliverEmail(member, gmailForwardingConfirmation);
    expect(await confirmationFor(member, 'gmail')).toMatchObject({
      service: 'gmail',
      code: '123456789',
      forwardingFrom: 'ann@halcyon.test',
    });
    // Outlook's screen doesn't show Gmail's code; "something else" shows whichever came.
    expect(await confirmationFor(member, 'outlook')).toBeNull();
    await deliverEmail(member, outlookForwardingConfirmation);
    expect(await confirmationFor(member, 'outlook')).toMatchObject({
      code: '482913',
      link: 'https://outlook.live.com/mail/options/forwarding/verify?t=made-up-token',
    });
    expect((await confirmationFor(member, 'other'))?.service).toBe('outlook');
    // A confirmation alone isn't forwarding: it comes before any rule forwards anything.
    expect(await forwardingStillToDoFor(member)).toBe(true);
  });

  it('UX-LT-18: an old confirmation, or another organisation’s, isn’t shown', async () => {
    const member = await createTestMember();
    const other = await createTestMember();
    await deliverEmail(other, gmailForwardingConfirmation);
    expect(await confirmationFor(member, 'gmail')).toBeNull();
    const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    expect(await confirmationFor(other, 'gmail', later)).toBeNull();
  });
});

describe('UX-LT-19: a test enquiry through the person’s own rule, answered', () => {
  it('UX-LT-19: the test goes to the person’s mailbox, comes back through the rule, and puts forwarding in place', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    expect(await forwardingFor(member)).toMatchObject({
      worksAt: null,
      testSentAt: null,
      testArrivedAt: null,
      testSender: 'forwarding-test@mail.gaff.test',
    });

    await sendForwardingTest(member, { to: 'Ann@Halcyon.test', service: 'gmail' });
    const sent = await testEmailTo('ann@halcyon.test');
    expect(sent.fromAddress).toBe('"Gaff" <forwarding-test@mail.gaff.test>');
    expect(sent.subject).toMatch(/^Test enquiry from Gaff \([a-z2-9]{12}\)$/);
    expect(sent.text).toContain('made-up enquiry from Gaff');
    const waiting = await forwardingFor(member);
    expect(waiting.testSentAt).not.toBeNull();
    expect(waiting.testArrivedAt).toBeNull();
    expect(await forwardingStillToDoFor(member)).toBe(true);

    expect(await forwardedBack(member, sent)).toEqual({ kind: 'forwarding_test' });
    const arrived = await forwardingFor(member);
    expect(arrived.testArrivedAt).not.toBeNull();
    expect(arrived.worksAt).not.toBeNull();
    expect(await forwardingStillToDoFor(member)).toBe(false);

    // Nobody's enquiry: no renter is made, nothing waits in Inbox, and no reply goes out.
    const people = await withOrg(member.organisationId, (tx) => tx.select().from(applications));
    expect(people).toEqual([]);
    const waitingEmails = await withOrg(member.organisationId, (tx) =>
      tx.select().from(inboundEmails).where(eq(inboundEmails.status, 'needs_attention')),
    );
    expect(waitingEmails).toEqual([]);

    // The answer it would send: the first reply about the home the flow was opened from.
    const answer = await testReplyFor(member, lettingId);
    expect(answer?.address).toBe('12 Ranelagh Road');
    expect(answer?.reply.subject).toBe('Your enquiry about 12 Ranelagh Road');
    expect(answer?.reply.body).toMatch(/^Hello Sam,/);

    // The record: that a test went and came back, and how forwarding came to be in place.
    // Never the address it went to.
    const record = (await organisationEvents(member)).filter((e) =>
      e.type.startsWith('forwarding.'),
    );
    expect(record.map((e) => e.type)).toEqual([
      'forwarding.test_sent',
      'forwarding.test_arrived',
      'forwarding.in_place',
    ]);
    expect(record[0]).toMatchObject({ actorType: 'person', data: { service: 'gmail' } });
    expect(record[2]).toMatchObject({ actorType: 'system', data: { via: 'test' } });
    expect(JSON.stringify(record)).not.toContain('halcyon.test');
  });

  it('UX-LT-19: an earlier test’s email, or one with the reference changed, isn’t taken for the new one', async () => {
    const member = await createTestMember();
    await sendForwardingTest(member, { to: 'niamh@halcyon.test', service: 'other' });
    const first = await testEmailTo('niamh@halcyon.test');
    await sendForwardingTest(member, { to: 'niamh@halcyon.test', service: 'other' });
    // The first test's email arrives late: it is set aside like any other email, not taken.
    expect(await forwardedBack(member, first)).toEqual({ kind: 'needs_attention' });
    expect((await forwardingFor(member)).testArrivedAt).toBeNull();
    const second = await testEmailTo('niamh@halcyon.test');
    expect(second.subject).not.toBe(first.subject);
    expect(await forwardedBack(member, second)).toEqual({ kind: 'forwarding_test' });
  });

  it('UX-LT-19: a test that couldn’t be sent leaves nothing waiting, and the address must be one', async () => {
    const member = await createTestMember();
    await expect(
      sendForwardingTest(member, { to: `ann@${UNDELIVERABLE_DOMAIN}`, service: 'gmail' }),
    ).rejects.toThrow('That didn’t send');
    expect((await forwardingFor(member)).testSentAt).toBeNull();
    await expect(
      sendForwardingTest(member, { to: 'not an address', service: 'gmail' }),
    ).rejects.toThrow();
    await expect(
      sendForwardingTest(member, { to: 'ann@halcyon.test', service: 'yahoo' as never }),
    ).rejects.toThrow();
  });

  it('UX-LT-19: with no home live, the test is still answered, with no home’s reply to show', async () => {
    const member = await createTestMember();
    expect(await testReplyFor(member, null)).toBeNull();
  });
});

describe('UX-LT-20: a home on Daft or MyHome with no forwarding says so, until mail comes through', () => {
  it('UX-LT-20: "Set up forwarding" is the home’s task until a portal’s enquiry arrives', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member, {
      daftUrl: 'https://www.daft.ie/for-rent/12-ranelagh-road/123456',
    });
    await setAdvertisedOn(member, lettingId, ['daft']);
    const tasks = async () =>
      (await dashboardFor(member)).everyone.filter(
        (item) => 'lettingId' in item && item.lettingId === lettingId,
      );
    expect(await tasks()).toMatchObject([{ kind: 'forwarding', portals: ['daft'] }]);

    await deliverEmail(member, daftEnquiry);
    expect((await tasks()).map((item) => item.kind)).not.toContain('forwarding');
    expect(await forwardingStillToDoFor(member)).toBe(false);
    const inPlace = (await organisationEvents(member)).filter(
      (e) => e.type === 'forwarding.in_place',
    );
    expect(inPlace).toMatchObject([{ data: { via: 'enquiry' } }]);

    // Another enquiry changes nothing: it was in place already.
    expect(await deliverEmail(member, myhomeEnquiry)).toMatchObject({ kind: 'enquiry' });
    expect(
      (await organisationEvents(member)).filter((e) => e.type === 'forwarding.in_place'),
    ).toHaveLength(1);
  });

  it('UX-LT-20: once the test has come through, no home asks for forwarding, and a home said No never did', async () => {
    const member = await createTestMember();
    const { lettingId: onMyHome } = await aLiveLetting(member);
    const { lettingId: nowhere } = await aLiveLetting(member, { addressLine1: '9 Canal View' });
    await setAdvertisedOn(member, onMyHome, ['myhome']);
    await setAdvertisedOn(member, nowhere, []);
    const kinds = async () =>
      (await dashboardFor(member)).everyone
        .filter((item) => item.kind === 'forwarding')
        .map((item) => ('lettingId' in item ? item.lettingId : null));
    expect(await kinds()).toEqual([onMyHome]);
    await sendForwardingTest(member, { to: 'ann@halcyon.test', service: 'outlook' });
    await forwardedBack(member, await testEmailTo('ann@halcyon.test'));
    expect(await kinds()).toEqual([]);
  });

  it('UX-LT-20: forwarding is the organisation’s: another organisation’s rule changes nothing here', async () => {
    const member = await createTestMember();
    const other = await createTestMember();
    await sendForwardingTest(other, { to: 'other@halcyon.test', service: 'gmail' });
    await forwardedBack(other, await testEmailTo('other@halcyon.test'));
    expect(await forwardingStillToDoFor(other)).toBe(false);
    expect(await forwardingStillToDoFor(member)).toBe(true);
    // The other organisation's test, arriving here, is just an email Gaff couldn't place.
    await sendForwardingTest(other, { to: 'other@halcyon.test', service: 'gmail' });
    const sent = await testEmailTo('other@halcyon.test');
    expect(await forwardedBack(member, sent)).toEqual({ kind: 'needs_attention' });
    expect(await forwardingStillToDoFor(member)).toBe(true);
    const ignored = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ status: inboundEmails.status })
        .from(inboundEmails)
        .where(and(eq(inboundEmails.subject, sent.subject))),
    );
    expect(ignored).toEqual([{ status: 'needs_attention' }]);
  });
});
