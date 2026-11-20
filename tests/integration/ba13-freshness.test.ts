import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { devOutbox, events, lettings, messages } from '@/db/schema';
import { todayRows } from '@/domain/dashboard/today-rows';
import { sendAccountEmail } from '@/server/accounts/emails';
import { askToView } from '@/server/enquiries/ask-to-view';
import { dashboardFor } from '@/server/dashboard/dashboard';
import { publicHomePage, publicHomesForSearch } from '@/server/homes/public-homes';
import {
  confirmByLink,
  confirmStillAvailable,
  freshnessOf,
  stillAvailableByLink,
  sweepFreshness,
} from '@/server/lettings/freshness';
import { addPhoto } from '@/server/lettings/photos';
import { recordEvent } from '@/server/record/events';
import { aPng } from '../fixtures/photos';
import {
  aLiveLetting,
  aRenterEnquires,
  createTestMember,
  type Member,
  queuedJobs,
} from './helpers';

const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

/** A live home on Gaff, with a photo, in a town no other test uses. */
async function aHomeOnGaff(member: Member, addressLine1 = '2 Mall Road') {
  const { lettingId } = await aLiveLetting(member, {
    addressLine1,
    area: 'Ballina',
    county: 'Mayo',
    eircode: '',
  });
  await addPhoto(member, lettingId, aPng([36, 99, 168]));
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx.select({ ref: lettings.publicRef }).from(lettings).where(eq(lettings.id, lettingId)),
  );
  return { lettingId, ref: row!.ref };
}

const mailTo = (address: string) =>
  db().select().from(devOutbox).where(eq(devOutbox.toAddress, address));

/** Sends the "still available" emails queued for this organisation, as the worker would. */
async function sendStillAvailableEmails(organisationId: string): Promise<void> {
  for (const payload of await queuedJobs('send_account_email')) {
    if (payload.kind === 'still_available' && payload.organisationId === organisationId) {
      await sendAccountEmail(payload, 'job');
    }
  }
}

const linkIn = (text: string) =>
  /\/still-available\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{43})/.exec(text);

async function firstRepliesTo(member: Member, applicationId: string) {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply'))),
  );
}

const onGaff = async (ref: string) =>
  (await publicHomesForSearch()).some((home) => home.home.ref === ref);

describe('M49: a live home stays fresh', () => {
  it('M49: unchanged for 14 days, its lister is asked once, on Today and in one email with a link', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member);
    expect(await sweepFreshness(days(13), member.organisationId)).toEqual({
      asked: 0,
      steppedBack: 0,
    });
    expect(await sweepFreshness(days(15), member.organisationId)).toEqual({
      asked: 1,
      steppedBack: 0,
    });
    // Running it again asks nobody twice.
    expect(await sweepFreshness(days(15.5), member.organisationId)).toEqual({
      asked: 0,
      steppedBack: 0,
    });
    expect(await onGaff(ref)).toBe(true);

    // Today: one row, which opens the task, saying when it would come off.
    const board = await dashboardFor(member, days(15));
    const rows = todayRows(board.everyone, days(15)).filter((row) => row.kind === 'freshness');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Say if it’s still available · 2 Mall Road',
      href: `/lettings/${lettingId}/still-available`,
    });
    expect(rows[0]!.why).toMatch(/^Comes off gaff\.ie on \w+day \d+ \w+ unless you do$/);

    await sendStillAvailableEmails(member.organisationId);
    const [mail, ...more] = await mailTo(member.email);
    expect(more).toHaveLength(0);
    expect(mail!.subject).toBe('Is 2 Mall Road still available?');
    expect(mail!.text).toContain('2 Mall Road has been on Gaff for two weeks with no change.');
    expect(linkIn(mail!.text)?.[1]).toBe(lettingId);
    // The record holds codes and numbers only.
    const [asked] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data, actor: events.actorType })
        .from(events)
        .where(and(eq(events.lettingId, lettingId), eq(events.type, 'letting.freshness_asked'))),
    );
    expect(asked).toEqual({ data: { days: 14 }, actor: 'system' });
  });

  it('M49: unanswered for 3 days, it steps back from Gaff’s pages and search, and its enquiries wait', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, '4 Mall Road');
    await sweepFreshness(days(15), member.organisationId);
    expect(await sweepFreshness(days(17.9), member.organisationId)).toMatchObject({
      steppedBack: 0,
    });
    expect(await sweepFreshness(days(18), member.organisationId)).toEqual({
      asked: 0,
      steppedBack: 1,
    });
    expect(await onGaff(ref)).toBe(false);
    expect(await publicHomePage(ref)).toBeNull();
    expect(await askToView(ref, {}, null)).toEqual({ ok: false, gone: true });
    // The reason is shown on the letting, and Today asks.
    expect(await freshnessOf(member, lettingId)).toMatchObject({ kind: 'stepped_back' });
    const rows = todayRows((await dashboardFor(member)).everyone, new Date()).filter(
      (row) => row.kind === 'freshness',
    );
    expect(rows[0]?.why).toBe(
      'Off gaff.ie until you say it’s still available. Its enquiries are waiting',
    );
    // An enquiry from Daft waits: no first reply until the lister says.
    const applicationId = await aRenterEnquires(member, 1);
    expect(await firstRepliesTo(member, applicationId)).toEqual([]);

    // "Still available" from Gaff: back at once, and what waited is answered.
    expect(await confirmStillAvailable(member, lettingId, days(19))).toEqual({ wasStale: true });
    expect(await onGaff(ref)).toBe(true);
    expect(await firstRepliesTo(member, applicationId)).toHaveLength(1);
    expect(await freshnessOf(member, lettingId, days(19))).toBeNull();
    // The clock starts again: nothing is asked until 14 days on.
    expect(await sweepFreshness(days(20), member.organisationId)).toEqual({
      asked: 0,
      steppedBack: 0,
    });
  });

  it('M49: confirmed from the email’s link with no sign-in; the link works once, and only as sent', async () => {
    const member = await createTestMember();
    const { lettingId, ref } = await aHomeOnGaff(member, '6 Mall Road');
    await sweepFreshness(days(15), member.organisationId);
    await sweepFreshness(days(18), member.organisationId);
    expect(await onGaff(ref)).toBe(false);
    await sendStillAvailableEmails(member.organisationId);
    const [mail] = await mailTo(member.email);
    const [, id, token] = linkIn(mail!.text)!;

    // A made-up or altered link opens nothing.
    expect(await stillAvailableByLink(id!, 'x'.repeat(43))).toBeNull();
    // The last character changes to one it isn't, so this is never the link as sent.
    const altered = `${token!.slice(0, -1)}${token!.endsWith('A') ? 'B' : 'A'}`;
    expect(await confirmByLink(id!, altered)).toBeNull();
    expect(await stillAvailableByLink(crypto.randomUUID(), token!)).toBeNull();
    // Opening it asks first: nothing changes until the button.
    expect(await stillAvailableByLink(id!, token!)).toMatchObject({
      address: '6 Mall Road',
      shown: { kind: 'stepped_back' },
    });
    expect(await onGaff(ref)).toBe(false);
    expect(await confirmByLink(id!, token!, days(19))).toEqual({ address: '6 Mall Road' });
    expect(await onGaff(ref)).toBe(true);
    const [said] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ data: events.data, actor: events.actorType })
        .from(events)
        .where(
          and(eq(events.lettingId, lettingId), eq(events.type, 'letting.confirmed_available')),
        ),
    );
    expect(said).toEqual({
      data: { via: 'email', wasStale: true, firstReplies: 0 },
      actor: 'system',
    });
    // Used once, it has done its job.
    expect(await stillAvailableByLink(id!, token!, days(19))).toBeNull();
    expect(await confirmByLink(id!, token!, days(19))).toBeNull();
  });

  it('M49: a change by the lister restarts the clock, and answers an ask', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member, '8 Mall Road');
    await sweepFreshness(days(15), member.organisationId);
    expect(await freshnessOf(member, lettingId, days(15))).toMatchObject({ kind: 'asked' });
    // Half a day after the ask, the lister changes the home's details.
    await withOrg(member.organisationId, (tx) =>
      recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId,
        actor: { type: 'person', userId: member.userId },
        type: 'letting.details_changed',
        data: { step: 'home' },
        occurredAt: days(15.5),
      }),
    );
    expect(await freshnessOf(member, lettingId, days(16))).toBeNull();
    expect(await sweepFreshness(days(18), member.organisationId)).toEqual({
      asked: 0,
      steppedBack: 0,
    });
    // A change by the system isn't the lister's: it doesn't count.
    expect(await sweepFreshness(days(30), member.organisationId)).toEqual({
      asked: 1,
      steppedBack: 0,
    });
  });

  it('M49: the email goes only while its ask is open', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member, '9 Mall Road');
    await sweepFreshness(days(15), member.organisationId);
    await confirmStillAvailable(member, lettingId, days(15.1));
    await sendStillAvailableEmails(member.organisationId);
    expect(await mailTo(member.email)).toHaveLength(0);
  });

  it('M49: a home with an offer out counts as fresh', async () => {
    const member = await createTestMember();
    const { lettingId } = await aHomeOnGaff(member, '10 Mall Road');
    const applicationId = await aRenterEnquires(member, 2);
    await withOrg(member.organisationId, async (tx) => {
      const { offers } = await import('@/db/schema');
      await tx.insert(offers).values({
        organisationId: member.organisationId,
        lettingId,
        applicationId,
        role: 'preferred',
        rentCents: 185_000,
        depositCents: 185_000,
        startDate: '2026-12-01',
        deadlineHours: 48,
        expiresAt: days(40),
        decisionId: crypto.randomUUID(),
      });
    });
    expect(await sweepFreshness(days(30), member.organisationId)).toEqual({
      asked: 0,
      steppedBack: 0,
    });
  });
});
