import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { eventCatalogue } from '@/server/record/events';
import { withOrg } from '@/db/client';
import { applications, events, inventoryItems, tenancies, viewingSlots } from '@/db/schema';
import { submitApplication } from '@/server/applications/apply';
import { loadRenterPage } from '@/server/renter/answers';
import { renterModel } from '@/server/renter/model';
import { sweepPersonalData } from '@/server/retention/sweep';
import { finishLetting } from '@/server/tenancy/close';
import { inviteToView } from '@/server/shortlist/invite';
import {
  addInventoryItem,
  confirmInventory,
  inventoryFor,
  queryInventoryItem,
  shareInventory,
} from '@/server/tenancy/movein';
import { givePpsn, markRtbRegistered, skipPpsn } from '@/server/tenancy/rtb';
import { markAttendance } from '@/server/viewings/attendance';
import { cancelViewing } from '@/server/viewings/booking';
import { expireOffer, offerFreedPlace } from '@/server/viewings/waitlist';
import { freeTextFields } from '../compliance/free-text';
import {
  aLetHome,
  aLiveLetting,
  aRenterEnquires,
  createTestMember,
  peopleWhoApplied,
  tokenInMessage,
  bookAs,
} from './helpers';

/**
 * Work package WP-12: what the renter's pages rest on in `src/server` (UX-RN-1 to UX-RN-26).
 * The page a link shows is worked out from what Gaff holds (`renterModel`), so these read the
 * model the way the page does.
 */

type Member = Awaited<ReturnType<typeof createTestMember>>;

const options = { providers: { identity: true, income: true }, retentionDays: 30 };

async function modelFor(token: string) {
  const page = await loadRenterPage(token);
  if (!page) throw new Error('The link didn’t open');
  return renterModel(page, options);
}

const logged = (member: Member, type: string) =>
  withOrg(member.organisationId, (tx) =>
    tx.select().from(events).where(eq(events.type, type)).orderBy(asc(events.id)),
  );

/** A live letting with one-person slots: the first renter is invited, the second waits. */
async function oneInvitedOneWaiting() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const invited = await aRenterEnquires(member, 1, { occupants: '1', hasPets: 'no' });
  const waiting = await aRenterEnquires(member, 2, { occupants: '1', hasPets: 'no' });
  await inviteToView(member, lettingId, { chosenIds: [invited], waitlistSize: 1 });
  const slots = await withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, lettingId))
      .orderBy(asc(viewingSlots.startsAt)),
  );
  return {
    member,
    lettingId,
    invited,
    waiting,
    slots,
    token: await tokenInMessage(member, invited, 'invitation'),
  };
}

describe('UX-RN-4 (rule 1): nothing a renter answers ends their path', () => {
  it('shows the same “answers sent” page whether or not the answers meet the criteria', async () => {
    const member = await createTestMember();
    await aLiveLetting(member);
    // The home asks for no pets and a small household. One renter meets both, one meets neither.
    const meets = await aRenterEnquires(member, 1, { occupants: '1', hasPets: 'no' });
    const doesnt = await aRenterEnquires(member, 2, { occupants: '6', hasPets: 'yes' });
    const views = [];
    for (const id of [meets, doesnt]) {
      const token = await tokenInMessage(member, id, 'first_reply');
      views.push((await modelFor(token)).view);
    }
    expect(views).toEqual(['answers_sent', 'answers_sent']);
  });
});

describe('UX-RN-5 to UX-RN-10: the viewing a renter’s page shows', () => {
  it('UX-RN-5: gives the free times by day, and a booked page once one is taken', async () => {
    const { token, slots } = await oneInvitedOneWaiting();
    const before = await modelFor(token);
    expect(before.view).toBe('invited');
    expect(before.viewings.days.flatMap((day) => day.times)).toHaveLength(slots.length);
    // UX-RN-7 (Q12): a number that came with the enquiry is never shown as a reminder number.
    expect(before.viewings.reminderNumber).toBeNull();
    // P16: the mobile they confirm to book is, masked.
    expect(await bookAs(token, slots[0]!.id, '086 765 4321')).toMatchObject({ ok: true });
    const after = await modelFor(token);
    expect(after.view).toBe('booked');
    expect(after.viewings.booking?.slotId).toBe(slots[0]!.id);
    expect(after.viewings.reminderNumber).toBe('086 ••• 4321');
  });

  it('UX-RN-9: after cancelling, the page is “cancelled”, until they book again', async () => {
    const { token, slots } = await oneInvitedOneWaiting();
    await bookAs(token, slots[0]!.id);
    expect(await cancelViewing(token)).toEqual({ ok: true });
    expect((await modelFor(token)).view).toBe('cancelled');
    await bookAs(token, slots[1]!.id);
    expect((await modelFor(token)).view).toBe('booked');
  });

  it('UX-RN-6, UX-RN-10: a held place is one time, with the hold’s end in words; a hold that ran out says so', async () => {
    const { member, token, slots, waiting } = await oneInvitedOneWaiting();
    const waitingToken = await tokenInMessage(member, waiting, 'first_reply');
    expect((await modelFor(waitingToken)).view).toBe('waiting_list');

    await bookAs(token, slots[0]!.id);
    await cancelViewing(token);
    await offerFreedPlace(member.organisationId, slots[0]!.id);
    const offered = await modelFor(waitingToken);
    expect(offered.view).toBe('place_offered');
    expect(offered.viewings.place?.slotId).toBe(slots[0]!.id);
    expect(offered.viewings.place?.held).toMatch(
      /^until \d{1,2}(:\d{2})?(am|pm) (today|tomorrow)$/,
    );

    const page = await loadRenterPage(waitingToken);
    await expireOffer({ organisationId: member.organisationId, offerId: page!.offer!.id });
    const after = await modelFor(waitingToken);
    expect(after.view).toBe('hold_ran_out');
    expect(after.viewings.place).toBeNull();
  });
});

describe('UX-RN-11: the check screen’s name and email, each with “Change”', () => {
  async function someoneWhoCame() {
    const { member, lettingId, invited, token, slots } = await oneInvitedOneWaiting();
    await bookAs(token, slots[0]!.id);
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(viewingSlots)
        .set({ startsAt: new Date(Date.now() - 5 * 60_000) })
        .where(eq(viewingSlots.id, slots[0]!.id)),
    );
    const page = await loadRenterPage(token);
    await markAttendance(member, {
      lettingId,
      bookingId: page!.booking!.booking.id,
      attended: true,
    });
    return { member, lettingId, applicationId: invited, token, email: page!.application.email };
  }
  const answers = { earning: 'employed', monthlyIncome: '4,800' };
  const person = async (member: Member, id: string) =>
    (
      await withOrg(member.organisationId, (tx) =>
        tx.select().from(applications).where(eq(applications.id, id)),
      )
    )[0]!;

  it('keeps a corrected name, and logs that it changed without the name', async () => {
    const { member, applicationId, token } = await someoneWhoCame();
    expect(await submitApplication(token, { ...answers, fullName: 'A' })).toEqual({
      ok: false,
      errors: { fullName: 'Enter your first and last name.' },
    });
    expect(await submitApplication(token, { ...answers, fullName: 'Aoife Ní Bhroin' })).toEqual({
      ok: true,
    });
    expect(await person(member, applicationId)).toMatchObject({
      fullName: 'Aoife Ní Bhroin',
      status: 'applied',
    });
    const [change] = await logged(member, 'application.details_changed');
    expect(change!.data).toEqual({ applicationId, name: true, email: false });
    expect(JSON.stringify(change)).not.toContain('Bhroin');
  });

  it('changes the email only for someone who has shown the current address is theirs', async () => {
    const { member, applicationId, token, email } = await someoneWhoCame();
    const moved = { ...answers, email: 'aoife.new@example.ie' };
    // UX-SI-12: from the link alone, the one-time code is asked for first, and nothing is kept.
    expect(await submitApplication(token, moved)).toEqual({ ok: false, needsCode: true });
    expect(await person(member, applicationId)).toMatchObject({ email, status: 'attended' });

    expect(await submitApplication(token, moved, { emailCanChange: true })).toEqual({ ok: true });
    expect(await person(member, applicationId)).toMatchObject({
      email: 'aoife.new@example.ie',
      emailNormalised: 'aoife.new@example.ie',
    });
    const [change] = await logged(member, 'application.details_changed');
    expect(change!.data).toEqual({ applicationId, name: false, email: true });
    expect(JSON.stringify(change)).not.toContain('aoife.new');
    // The same address in other letters is no change at all: no code is asked for.
    expect(await submitApplication(token, { ...answers, email: 'Aoife.New@Example.ie' })).toEqual({
      ok: true,
    });
  });

  it('refuses an email someone else used for the same home (R6)', async () => {
    const { member, token, lettingId } = await someoneWhoCame();
    const [other] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ email: applications.email })
        .from(applications)
        .where(and(eq(applications.lettingId, lettingId), eq(applications.status, 'waitlisted'))),
    );
    expect(
      await submitApplication(
        token,
        { ...answers, email: other!.email.toUpperCase() },
        { emailCanChange: true },
      ),
    ).toEqual({
      ok: false,
      errors: {
        email: 'That email is already used for this home. Use another, or keep the one you have.',
      },
    });
  });

  it('asks for nothing but the two answers: anything else that is sent is dropped (rule 2)', async () => {
    const { member, applicationId, token } = await someoneWhoCame();
    const before = await person(member, applicationId);
    expect(
      await submitApplication(token, {
        ...answers,
        phone: '087 000 0000',
        dateOfBirth: '1990-01-01',
        nationality: 'Irish',
      }),
    ).toEqual({ ok: true });
    const after = await person(member, applicationId);
    expect(after.phone).toBe(before.phone);
    expect(JSON.stringify(after)).not.toMatch(/1990-01-01|Irish/);
  });
});

describe('UX-RN-15, UX-RN-18: the checks, one at a time', () => {
  it('lists the three as next and to come for the chosen applicant, and asks nothing of anyone else', async () => {
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800, 4000]);
    const { chooseApplicants } = await import('@/server/applications/choose');
    const tokens = await Promise.all(
      ids.map((id) => tokenInMessage(member, id, 'apply_invitation')),
    );
    // UX-RN-1 (rule 2): before a person chooses, nobody's page is the checks.
    for (const token of tokens) expect((await modelFor(token)).view).toBe('applied');
    await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });

    const chosen = await modelFor(tokens[0]!);
    expect(chosen.view).toBe('checks');
    expect(chosen.checks.list).toEqual([
      { check: 'identity', state: 'next' },
      { check: 'income', state: 'to_come' },
      { check: 'references', state: 'to_come' },
    ]);
    expect(chosen.checks.next).toBe('identity');
    expect((await modelFor(tokens[1]!)).view).toBe('checks');
    // The third applicant is neither preferred nor backup: no checks, and no documents.
    const third = await modelFor(tokens[2]!);
    expect(third.view).toBe('applied');
    expect(third.checks.items).toEqual([]);
  });

  it('UX-RN-18: “No” to both referees finishes the references, with nothing called missing', async () => {
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800]);
    const { chooseApplicants } = await import('@/server/applications/choose');
    const { submitReferees } = await import('@/server/checks/checks');
    await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
    const token = await tokenInMessage(member, ids[0]!, 'apply_invitation');
    expect(await submitReferees(token, { landlordNone: 'yes', employerNone: 'yes' })).toEqual({
      ok: true,
    });
    const model = await modelFor(token);
    expect(model.checks.list.find((item) => item.check === 'references')?.state).toBe('done');
    expect(model.checks.referees).toEqual([]);
  });
});

describe('UX-RN-24: the PPS number is its own step, asked once', () => {
  const paid = (member: Member, lettingId: string) =>
    withOrg(member.organisationId, (tx) =>
      tx
        .update(tenancies)
        .set({
          agreementStatus: 'signed_on_paper',
          paymentRequestedAt: new Date(),
          paymentReceivedAt: new Date(),
        })
        .where(eq(tenancies.lettingId, lettingId)),
    );

  it('is asked after payment, and never again once it’s skipped', async () => {
    const member = await createTestMember();
    const { lettingId, tenantToken } = await aLetHome(member);
    expect((await modelFor(tenantToken)).tenancy?.task).not.toBe('pps');
    await paid(member, lettingId);
    expect((await modelFor(tenantToken)).tenancy?.task).toBe('pps');

    expect(await skipPpsn(tenantToken)).toBe(true);
    expect(await skipPpsn(tenantToken)).toBe(true);
    expect((await modelFor(tenantToken)).tenancy?.task).toBe('moving_in');
    const [tenancy] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(tenancies).where(eq(tenancies.lettingId, lettingId)),
    );
    expect(tenancy!.ppsnSkippedAt).toBeInstanceOf(Date);
    expect(tenancy!.ppsnSealed).toBeNull();
    // Logged once, by ID only.
    const skips = await logged(member, 'tenancy.ppsn_skipped');
    expect(skips.map((e) => e.data)).toEqual([{ tenancyId: tenancy!.id }]);
  });

  it('isn’t asked again once it’s given, or once the tenancy is registered', async () => {
    const member = await createTestMember();
    const { lettingId, tenantToken } = await aLetHome(member);
    await paid(member, lettingId);
    expect(await givePpsn(tenantToken, { ppsn: '1234567T' })).toEqual({ ok: true });
    expect((await modelFor(tenantToken)).tenancy?.task).toBe('moving_in');

    const other = await createTestMember();
    const second = await aLetHome(other);
    await withOrg(other.organisationId, (tx) =>
      tx
        .update(tenancies)
        .set({
          agreementStatus: 'signed_on_paper',
          paymentRequestedAt: new Date(),
          paymentReceivedAt: new Date(),
        })
        .where(eq(tenancies.lettingId, second.lettingId)),
    );
    await markRtbRegistered(other, second.lettingId, { reference: 'RT0012345' });
    expect((await modelFor(second.tenantToken)).tenancy?.task).toBe('moving_in');
  });

  it('skips nothing for a link that isn’t a tenant’s', async () => {
    expect(await skipPpsn('not-a-real-link')).toBe(false);
    const { token } = await oneInvitedOneWaiting();
    expect(await skipPpsn(token)).toBe(false);
  });
});

describe('UX-RN-25: “Something’s not right” about an item of the inventory', () => {
  const item = { room: 'Kitchen', item: 'Fridge', condition: 'good', note: '' };

  async function aSharedInventory() {
    const member = await createTestMember();
    const home = await aLetHome(member);
    await addInventoryItem(member, home.lettingId, item, null);
    await addInventoryItem(member, home.lettingId, { ...item, room: 'Bedroom', item: 'Bed' }, null);
    const items = await inventoryFor(member, home.lettingId);
    const named = (name: string) => items.find((each) => each.item === name)!;
    return { member, ...home, fridge: named('Fridge'), bed: named('Bed') };
  }

  it('keeps the tenant’s note with the item, where the operator sees it; the record holds no words', async () => {
    const { member, lettingId, tenantToken, fridge, bed } = await aSharedInventory();
    // Not before the inventory is shared with them.
    expect(await queryInventoryItem(tenantToken, fridge.id, { note: 'Too early' })).toEqual({
      ok: false,
      closed: true,
    });
    await shareInventory(member, lettingId);
    expect(await queryInventoryItem(tenantToken, fridge.id, { note: '   ' })).toEqual({
      ok: false,
      errors: { note: 'Write a short note about what’s not right.' },
    });
    expect(await queryInventoryItem(tenantToken, fridge.id, { note: 'x'.repeat(501) })).toEqual({
      ok: false,
      errors: { note: 'Keep the note to 500 characters.' },
    });
    expect(
      await queryInventoryItem(tenantToken, fridge.id, {
        note: ' The freezer door doesn’t close. ',
      }),
    ).toEqual({ ok: true });

    const seen = await inventoryFor(member, lettingId);
    expect(seen.find((each) => each.id === fridge.id)?.tenantNote).toBe(
      'The freezer door doesn’t close.',
    );
    expect(seen.find((each) => each.id === bed.id)?.tenantNote).toBeNull();
    // The tenant's page shows it back, room by room.
    const page = await loadRenterPage(tenantToken);
    expect(page!.inventory.map((each) => [each.room, each.item, each.tenantNote])).toEqual([
      ['Bedroom', 'Bed', null],
      ['Kitchen', 'Fridge', 'The freezer door doesn’t close.'],
    ]);

    // Rule 8: the event says which item, never what was said.
    const [event] = await logged(member, 'inventory.item_queried');
    expect(event!.data).toEqual({ tenancyId: expect.any(String), itemId: fridge.id });
    expect(JSON.stringify(event)).not.toContain('freezer');
    expect(freeTextFields(eventCatalogue['inventory.item_queried'])).toEqual([]);

    // A note can still be sent, or changed, after confirming: it's a note, not a refusal.
    expect(await confirmInventory(tenantToken)).toBe(true);
    expect(await queryInventoryItem(tenantToken, fridge.id, { note: 'It’s been fixed.' })).toEqual({
      ok: true,
    });
  });

  it('is only for the tenant’s own inventory', async () => {
    const { member, lettingId, fridge } = await aSharedInventory();
    await shareInventory(member, lettingId);
    // Another organisation's tenant, with a working link of their own.
    const elsewhere = await createTestMember();
    const theirs = await aLetHome(elsewhere);
    expect(await queryInventoryItem(theirs.tenantToken, fridge.id, { note: 'Not mine' })).toEqual({
      ok: false,
      closed: true,
    });
    expect(await queryInventoryItem('not-a-real-link', fridge.id, { note: 'Nobody’s' })).toBeNull();
    const [stored] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(inventoryItems).where(eq(inventoryItems.id, fridge.id)),
    );
    expect(stored!.tenantNote).toBeNull();
  });

  it('rule 9: the retention job deletes the note with the tenant’s other details', async () => {
    const { member, lettingId, tenantToken, fridge } = await aSharedInventory();
    await shareInventory(member, lettingId);
    await queryInventoryItem(tenantToken, fridge.id, { note: 'The freezer door doesn’t close.' });
    // Finishing the let home gives the tenant's details their deletion date (R26).
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(tenancies)
        .set({ agreementStatus: 'signed_on_paper', paymentReceivedAt: new Date() })
        .where(eq(tenancies.lettingId, lettingId)),
    );
    const { deleteAfter } = await finishLetting(member, lettingId);
    const due = new Date(`${deleteAfter}T12:00:00Z`);
    await sweepPersonalData(due, member.organisationId);
    const [stored] = await withOrg(member.organisationId, (tx) =>
      tx.select().from(inventoryItems).where(eq(inventoryItems.id, fridge.id)),
    );
    expect(stored).toMatchObject({ tenantNote: null, tenantNotedAt: null, item: 'Fridge' });
  });
});

describe('UX-RN-26: the tenant’s steps match the operator’s', () => {
  it('never shows a step open after a later one is done', async () => {
    const member = await createTestMember();
    const { lettingId, tenantToken } = await aLetHome(member);
    const states = async () =>
      (await modelFor(tenantToken)).tenancy!.steps.map((step) => step.state);
    expect(await states()).toEqual(['next', 'to_come', 'to_come']);
    // The operator records moving in before anything else was ticked off (signed on paper, paid
    // by hand): the tenant's page closes the earlier steps too.
    await withOrg(member.organisationId, (tx) =>
      tx
        .update(tenancies)
        .set({ moveInCompletedAt: new Date() })
        .where(eq(tenancies.lettingId, lettingId)),
    );
    expect(await states()).toEqual(['done', 'done', 'next']);
  });
});
