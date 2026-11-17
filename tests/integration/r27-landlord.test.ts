import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withOrg } from '@/db/client';
import { applications, devOutbox, events, landlords, lettings, messages } from '@/db/schema';
import { OWNER_RECORD } from '@/domain/landlord/owner-page';
import { chooseApplicants } from '@/server/applications/choose';
import { landlordView } from '@/server/landlord/view';
import { landlordSharing, shareWithOwner, stopSharingWithLandlord } from '@/server/landlord/share';
import { sendMessage } from '@/server/messages/outbox';
import { answerApproval, askLandlord } from '@/server/offers/approval';
import { inviteToView } from '@/server/shortlist/invite';
import {
  aLetHome,
  aLiveLetting,
  aRenterEnquires,
  createTestMember,
  peopleWhoApplied,
  tokenInMessage,
  type Member,
} from './helpers';

const OWNER = { name: 'Mary Byrne', email: 'mary.byrne@example.ie' };

/** The owner's emails about a letting, newest last, as the outbox holds them. */
async function ownerEmails(member: Member, lettingId: string, kind = 'owner_link') {
  return withOrg(member.organisationId, (tx) =>
    tx
      .select()
      .from(messages)
      .where(and(eq(messages.lettingId, lettingId), eq(messages.kind, kind)))
      .orderBy(messages.createdAt),
  );
}

/** Shares the letting with its owner and returns the token in the link they were emailed. */
async function share(member: Member, lettingId: string, owner = OWNER): Promise<string> {
  const result = await shareWithOwner(member, lettingId, owner);
  if (!result.ok) throw new Error(`not shared: ${JSON.stringify(result)}`);
  const sent = await ownerEmails(member, lettingId);
  return /\/l\/([A-Za-z0-9_-]{43})$/m.exec(sent.at(-1)!.body)![1]!;
}

async function aSharedLetting() {
  const member = await createTestMember();
  const { lettingId } = await aLiveLetting(member);
  const first = await aRenterEnquires(member, 1, { occupants: '2', hasPets: 'no' });
  const second = await aRenterEnquires(member, 2, { occupants: '5', hasPets: 'no' });
  await inviteToView(member, lettingId, { chosenIds: [first], waitlistSize: 1 });
  const token = await share(member, lettingId);
  return { member, lettingId, first, second, token };
}

const logged = (member: Member, lettingId: string) =>
  withOrg(member.organisationId, (tx) =>
    tx.select().from(events).where(eq(events.lettingId, lettingId)).orderBy(events.id),
  );

describe('UX-OW-1, R27: the agent shares a letting with its owner', () => {
  it('UX-OW-1: emails the owner a private link, from their name and email, and keeps both on the letting', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    expect(await landlordSharing(member, lettingId)).toMatchObject({
      canShare: true,
      shared: false,
    });
    const result = await shareWithOwner(member, lettingId, {
      name: ' Tom Walsh ',
      email: 'TOM.WALSH@example.ie',
    });
    expect(result).toEqual({ ok: true, ownerName: 'Tom Walsh' });
    const [email] = await ownerEmails(member, lettingId);
    expect(email).toMatchObject({
      toAddress: 'tom.walsh@example.ie',
      subject: '12 Ranelagh Road: follow the letting',
      author: 'template',
      templateKey: 'owner_link@1',
      applicationId: null,
    });
    expect(email!.body).toMatch(/^http:\/\/localhost:\d+\/l\/[A-Za-z0-9_-]{43}$/m);
    expect(await landlordSharing(member, lettingId)).toMatchObject({
      shared: true,
      owner: { name: 'Tom Walsh', email: 'tom.walsh@example.ie' },
      lastOpenedAt: null,
    });
    const [letting] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ name: landlords.name, email: landlords.email })
        .from(lettings)
        .innerJoin(landlords, eq(landlords.id, lettings.landlordId))
        .where(eq(lettings.id, lettingId)),
    );
    expect(letting).toEqual({ name: 'Tom Walsh', email: 'tom.walsh@example.ie' });
  });

  it('UX-OW-1: can be shared before the home is live, as soon as the letting is created', async () => {
    const member = await createTestMember();
    const { aLetting } = await import('../fixtures/lettings');
    const { createLetting } = await import('@/server/lettings/create-letting');
    const { lettingId } = await createLetting(member, aLetting());
    const token = await share(member, lettingId);
    const view = await landlordView(token);
    expect(view).toMatchObject({ standing: { code: 'setting_up' }, figures: [], decisions: [] });
  });

  it('UX-OW-1: says what’s wrong with a name or an email at its field, and sends nothing', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    expect(await shareWithOwner(member, lettingId, { name: ' ', email: 'tom' })).toEqual({
      ok: false,
      errors: {
        name: 'Enter the owner’s name.',
        email: 'Enter an email address, like name@example.ie.',
      },
    });
    expect(await ownerEmails(member, lettingId)).toEqual([]);
    expect(await landlordSharing(member, lettingId)).toMatchObject({ shared: false });
  });

  it('UX-OW-1: a landlord letting their own home has no owner to share it with', async () => {
    const member = await createTestMember({ kind: 'private_landlord' });
    const { lettingId } = await aLiveLetting(member);
    expect(await landlordSharing(member, lettingId)).toMatchObject({ canShare: false });
    await expect(shareWithOwner(member, lettingId, OWNER)).rejects.toThrow(
      'This is your own home, so there’s no owner to share it with.',
    );
    expect(await ownerEmails(member, lettingId)).toEqual([]);
  });

  it('UX-OW-1: sharing again sends a new link, and the one before stops working', async () => {
    const { member, lettingId, token } = await aSharedLetting();
    const again = await share(member, lettingId, { name: 'Mary Byrne', email: 'mary@example.ie' });
    expect(again).not.toBe(token);
    expect(await landlordView(token)).toBeNull();
    expect(await landlordView(again)).not.toBeNull();
    expect((await ownerEmails(member, lettingId)).map((m) => m.toAddress)).toEqual([
      'mary.byrne@example.ie',
      'mary@example.ie',
    ]);
  });

  it('rule 8: the record holds IDs, codes and numbers only: never the owner’s name or email', async () => {
    const { member, lettingId } = await aSharedLetting();
    await share(member, lettingId, { name: 'Tom Walsh', email: 'tom.walsh@example.ie' });
    const sharing = (await logged(member, lettingId)).filter(
      (e) => e.type === 'letting.shared_with_landlord' || e.type === 'letting.landlord_added',
    );
    expect(sharing.map((e) => [e.type, e.data])).toEqual([
      ['letting.shared_with_landlord', { linkId: expect.any(String), replaced: 0 }],
      ['letting.landlord_added', { updated: true }],
      ['letting.shared_with_landlord', { linkId: expect.any(String), replaced: 1 }],
    ]);
    expect(JSON.stringify(sharing)).not.toMatch(/Tom|Walsh|Mary|Byrne|example\.ie/);
  });

  it('UX-PP-9, UX-PP-10: the owner’s email is the agency’s, with one button and no invitation to Gaff', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLiveLetting(member);
    await share(member, lettingId);
    const [message] = await ownerEmails(member, lettingId);
    expect(
      await sendMessage({
        organisationId: member.organisationId,
        messageId: message!.id,
        attempt: 1,
        maxAttempts: 10,
      }),
    ).toBe('sent');
    const [stored] = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, 'mary.byrne@example.ie'))
      .orderBy(desc(devOutbox.createdAt))
      .limit(1);
    // The words are the fixed template's, unchanged, as plain text. Replies reach the agency.
    expect(stored!.text).toBe(message!.body);
    expect(stored!.replyTo).toMatch(/^halcyon-[a-z0-9-]+@in\.gaff\.test$/);
    const html = stored!.html!;
    const [, header] = /data-email="header"[^>]*>([\s\S]*?)<\/td>/.exec(html)!;
    expect(header!.replace(/<[^>]+>/g, '')).toMatch(/^Halcyon/);
    expect(html).not.toContain('<img');
    expect(html.match(/data-email="button"/g)).toHaveLength(1);
    expect(html).toContain('>Open your page</a>');
    expect(html).toContain('Run with Gaff');
    expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/https?:\/\//);
    // The record says an email went to the owner, by its kind, and nothing about them.
    const sent = (await logged(member, lettingId)).find((e) => e.type === 'message.sent');
    expect(sent!.data).toMatchObject({ kind: 'owner_link', author: 'template' });
  });
});

describe('R27 and Q4, UX-OP-1 to UX-OP-5: the owner’s read-only page', () => {
  it('UX-OP-1: shows where the letting stands, the figures of its stage, what’s been decided and what’s asked', async () => {
    const { token } = await aSharedLetting();
    const view = await landlordView(token);
    expect(view).toMatchObject({
      letting: { addressLine1: '12 Ranelagh Road', stage: 'viewings' },
      criteria: ['Up to 3 people', 'No pets (assistance dogs always welcome)'],
      numbers: { enquiries: 2, answered: 2, invited: 1, waitlisted: 1 },
      standing: { code: 'viewings', booked: 0, places: 4 },
      figures: [
        { code: 'invited', value: 1 },
        { code: 'booked', value: 0, of: 4 },
        { code: 'waitlisted', value: 1 },
      ],
      summary: null,
    });
    expect(view!.nextViewingAt).toBeInstanceOf(Date);
    // Decisions only, newest first, each with who decided: a person at the agency, by name.
    expect(view!.decisions.map((d) => [d.type, d.actor])).toEqual([
      ['shortlist.decided', { kind: 'person', name: 'Ann Power' }],
      ['letting.went_live', { kind: 'person', name: 'Ann Power' }],
    ]);
    expect(view!.decisions[0]!.data).toMatchObject({ invited: 1, waitlisted: 1, notInvited: 0 });
  });

  it('UX-OP-2: renters are “Applicant N”, in the order they enquired', async () => {
    const { token } = await aSharedLetting();
    const view = await landlordView(token);
    const answered = view!.record.filter((step) => step.type === 'application.answered');
    expect(answered.map((step) => step.actor)).toEqual([
      { kind: 'applicant', label: 'Applicant 2' },
      { kind: 'applicant', label: 'Applicant 1' },
    ]);
  });

  it('UX-OP-2: never carries a renter’s name, email, phone or message', async () => {
    const { member, lettingId, token } = await aSharedLetting();
    const people = await withOrg(member.organisationId, (tx) =>
      tx.select().from(applications).where(eq(applications.lettingId, lettingId)),
    );
    const everything = JSON.stringify(await landlordView(token));
    for (const person of people) {
      expect(everything).not.toContain(person.fullName);
      expect(everything).not.toContain(person.email);
      expect(everything).not.toContain(person.phone ?? 'no phone');
    }
    expect(everything).not.toContain('I would love to view it');
  });

  it('UX-OP-2: still names nobody once the chosen tenant and backup are put to the owner: only the approval does', async () => {
    const member = await createTestMember();
    const { lettingId, ids } = await peopleWhoApplied(member, [5200, 4800, 6000]);
    await chooseApplicants(member, lettingId, { preferredId: ids[0]!, backupId: ids[1]! });
    const token = await share(member, lettingId);
    expect(await landlordView(token)).toMatchObject({
      standing: { code: 'checks' },
      figures: [
        { code: 'came', value: 3 },
        { code: 'applied', value: 3 },
        { code: 'checks_done', value: 0, of: 4 },
      ],
    });
    await askLandlord(member, lettingId);
    const asked = await landlordView(token);
    expect(asked).toMatchObject({ standing: { code: 'approval_asked' } });
    expect(JSON.stringify(asked)).not.toMatch(/Renter \d|@example\.ie/);

    // UX-OP-8 (Q42): the owner declines. Their page says so, and the record has no reason in it.
    const [request] = await ownerEmails(member, lettingId, 'landlord_approval');
    const approvalToken = /\/approve\/([A-Za-z0-9_-]{43})/.exec(request!.body)![1]!;
    await answerApproval(approvalToken, { preferred: 'decline', backup: 'approve' });
    const declined = await landlordView(token);
    expect(declined).toMatchObject({ standing: { code: 'declined' } });
    expect(declined!.decisions[0]).toMatchObject({
      type: 'landlord.approval_answered',
      actor: { kind: 'owner' },
      data: { preferred: 'declined', backup: 'approved' },
    });
    expect(Object.keys(declined!.decisions[0]!.data).sort()).toEqual([
      'approvalId',
      'backup',
      'preferred',
    ]);
  });

  it('UX-OP-3: the record keeps enquiries, invitations, viewings and decisions, and none of Gaff’s internal steps', async () => {
    const { member, lettingId, token } = await aSharedLetting();
    const all = (await logged(member, lettingId)).map((e) => e.type);
    // The log itself has the internal steps: fixed-wording messages going out, drafts, sharing.
    expect(all).toEqual(
      expect.arrayContaining(['letting.created', 'criteria.set', 'letting.shared_with_landlord']),
    );
    const view = await landlordView(token);
    const shown = view!.record.map((step) => step.type);
    for (const type of shown) expect(OWNER_RECORD, type).toContain(type);
    expect(shown).toEqual(
      expect.arrayContaining([
        'enquiry.received',
        'application.answered',
        'shortlist.decided',
        'viewings.session_added',
        'letting.went_live',
      ]),
    );
    expect(shown.filter((type) => /^(message|answers|reply|question)\./.test(type))).toEqual([]);
    expect(shown).not.toContain('letting.shared_with_landlord');
    expect(shown).not.toContain('rent_check.recorded');
    // Newest first.
    const times = view!.record.map((step) => step.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('UX-OP-5: once the home is let, it’s a summary: days to let, the rent, the start date and the RTB', async () => {
    const member = await createTestMember();
    const { lettingId } = await aLetHome(member);
    const token = await share(member, lettingId);
    const view = await landlordView(token);
    expect(view).toMatchObject({
      letting: { status: 'let' },
      standing: { code: 'let' },
      figures: [],
      summary: { daysToLet: 0, rentCents: 185_000, startDate: '2026-12-01', rtbRegisteredAt: null },
    });
    expect(JSON.stringify(view)).not.toMatch(/Renter \d|@example\.ie/);
  });

  it('UX-OW-4: stops working the moment the agent stops sharing, and a renter’s link never opens it', async () => {
    const { member, lettingId, first, token } = await aSharedLetting();
    expect(await landlordSharing(member, lettingId)).toMatchObject({ shared: true });
    const renterToken = await tokenInMessage(member, first, 'invitation');
    expect(await landlordView(renterToken)).toBeNull();
    expect(await stopSharingWithLandlord(member, lettingId)).toBe(1);
    expect(await landlordView(token)).toBeNull();
    expect(await landlordSharing(member, lettingId)).toMatchObject({
      shared: false,
      lastOpenedAt: null,
      owner: OWNER,
    });
    const sharing = (await logged(member, lettingId)).filter((e) => e.type.startsWith('letting.'));
    expect(sharing.map((e) => [e.type, Object.keys(e.data as object).sort()])).toEqual(
      expect.arrayContaining([
        ['letting.shared_with_landlord', ['linkId', 'replaced']],
        ['letting.landlord_link_revoked', ['links']],
      ]),
    );
  });

  it('records when the owner last looked', async () => {
    const { member, lettingId, token } = await aSharedLetting();
    await landlordView(token);
    const sharing = await landlordSharing(member, lettingId);
    expect(sharing!.lastOpenedAt).toBeInstanceOf(Date);
  });
});
