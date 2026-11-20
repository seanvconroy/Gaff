import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withOrg, withSystem } from '@/db/client';
import { applications, events, inboundEmails, lettings, messages } from '@/db/schema';
import { askableHome } from '@/server/enquiries/ask-to-view';
import { publicHomePage, resolvePublicHome } from '@/server/homes/public-homes';
import { closeEnquiries, reopenEnquiries } from '@/server/lettings/enquiries-close';
import { addPhoto } from '@/server/lettings/photos';
import { sweepPersonalData } from '@/server/retention/sweep';
import { liveHomesOnGaff } from '@/server/search/homes';
import { timelineFor } from '@/server/timeline/timeline';
import { daftEnquiry } from '../fixtures/emails';
import { aPng } from '../fixtures/photos';
import { aLiveLetting, createTestMember, deliverEmail, type Member } from './helpers';

async function aHomeOnGaff(member: Member) {
  const { lettingId } = await aLiveLetting(member);
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return { lettingId, ref: row!.ref };
}

const inSearch = async (ref: string) => (await liveHomesOnGaff()).some((h) => h.id === ref);

const eventsOf = (member: Member, lettingId: string) =>
  withOrg(member.organisationId, (tx) =>
    tx.select().from(events).where(eq(events.lettingId, lettingId)),
  );

describe('UX-LP-5, M52: stopping enquiries', () => {
  it('UX-LP-5: "Now": the page stays and says so, "Ask to view" is gone, and the home leaves search', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    expect(await inSearch(ref)).toBe(true);
    expect(await askableHome(ref)).not.toBeNull();

    const outcome = await closeEnquiries(member, lettingId, { when: 'now' });
    expect(outcome).toMatchObject({ ok: true, now: true });

    const page = await publicHomePage(ref);
    expect(page?.state).toBe('live');
    expect(page?.state === 'live' && page.home.askable).toBe(false);
    expect(await inSearch(ref)).toBe(false);
    expect(await askableHome(ref)).toBeNull();
    // Reporting and saving still find it: only asking to view is closed.
    expect(await resolvePublicHome(ref)).toMatchObject({ lettingId, enquiriesClosed: true });
    const recorded = (await eventsOf(member, lettingId)).filter(
      (e) => e.type === 'letting.enquiries_closed',
    );
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.data).toMatchObject({ when: 'now' });
    // History says so (UX-LP-6).
    const history = await timelineFor(member, lettingId);
    expect(JSON.stringify(history)).toContain('Stopped taking enquiries');
  });

  it('M52: a date and time ahead keeps it open until then; opening again cancels it', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    const inAWeek = new Date(Date.now() + 7 * 86_400_000);
    const date = inAWeek.toISOString().slice(0, 10);
    const outcome = await closeEnquiries(member, lettingId, { when: 'later', date, time: '18:00' });
    expect(outcome).toMatchObject({ ok: true, now: false });
    expect(await inSearch(ref)).toBe(true);
    expect(await askableHome(ref)).not.toBeNull();

    // The time comes.
    await withSystem((tx) =>
      tx
        .update(lettings)
        .set({ enquiriesCloseAt: new Date(Date.now() - 1000) })
        .where(eq(lettings.id, lettingId)),
    );
    expect(await inSearch(ref)).toBe(false);

    await reopenEnquiries(member, lettingId);
    expect(await inSearch(ref)).toBe(true);
    expect(await askableHome(ref)).not.toBeNull();
    const reopened = (await eventsOf(member, lettingId)).filter(
      (e) => e.type === 'letting.enquiries_reopened',
    );
    expect(reopened.map((e) => e.data)).toEqual([{ wasClosed: true }]);
  });

  it('M52: the errors are at the field, and only a live letting can stop', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member);
    expect(await closeEnquiries(member, lettingId, { when: 'later', date: '2020-01-01' })).toEqual({
      ok: false,
      errors: { date: 'Choose a date from today on' },
    });
    expect(await closeEnquiries(member, lettingId, {})).toMatchObject({
      ok: false,
      errors: { when: expect.any(String) },
    });
    await withSystem((tx) =>
      tx.update(lettings).set({ status: 'let' }).where(eq(lettings.id, lettingId)),
    );
    await expect(closeEnquiries(member, lettingId, { when: 'now' })).rejects.toThrow(
      'Only a live home takes enquiries.',
    );
  });

  it('UX-LP-5: a portal enquiry that comes after gets the fixed reply and isn’t added; people already in carry on', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member);
    // Someone enquired before it closed.
    const before = await deliverEmail(member, daftEnquiry);
    expect(before).toMatchObject({ kind: 'enquiry', lettingId });
    await closeEnquiries(member, lettingId, { when: 'now' });

    // A new person, after.
    const after = await deliverEmail(member, {
      ...daftEnquiry,
      replyTo: 'Niall Walsh <niall.walsh@example.ie>',
      text: daftEnquiry.text
        .replace('Aoife Byrne', 'Niall Walsh')
        .replace('aoife.byrne@example.ie', 'niall.walsh@example.ie'),
    });
    expect(after).toEqual({ kind: 'closed_reply' });
    const people = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.lettingId, lettingId)),
    );
    expect(people.map((p) => p.email)).toEqual(['aoife.byrne@example.ie']);
    const [reply] = await withOrg(member.organisationId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, 'enquiries_closed'))),
    );
    expect(reply).toMatchObject({
      toAddress: 'niall.walsh@example.ie',
      applicationId: null,
      author: 'template',
      templateKey: 'enquiries_closed@1',
      subject: '12 Ranelagh Road is no longer taking enquiries',
    });
    expect(reply!.body).toContain('Hello Niall,');
    const placed = await withOrg(member.organisationId, (tx) =>
      tx.select().from(inboundEmails).where(eq(inboundEmails.lettingId, lettingId)),
    );
    expect(placed.find((e) => e.applicationId === null)?.status).toBe('ignored');
    const told = (await eventsOf(member, lettingId)).find((e) => e.type === 'enquiry.after_close');
    expect(told?.data).toEqual({
      inboundEmailId: placed.find((e) => e.applicationId === null)!.id,
      messageId: reply!.id,
    });

    // The person already in it writes again: they carry on, as a repeat enquiry.
    const again = await deliverEmail(member, daftEnquiry);
    expect(again).toMatchObject({ kind: 'repeat', lettingId });

    // Rule 9: the reply's address and words are cleared on the unplaced-email schedule.
    await sweepPersonalData(new Date(Date.now() + 31 * 86_400_000), member.organisationId);
    const [cleared] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(messages).where(eq(messages.id, reply!.id)),
    );
    expect(cleared).toMatchObject({ toAddress: '', subject: '', body: '' });
  });
});
