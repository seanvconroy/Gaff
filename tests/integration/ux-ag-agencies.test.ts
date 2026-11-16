import { asc, eq, like } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleRegisterSource } from '@/adapters/register';
import { confirmAgencyAction, createPilotAgencyAction } from '@/app/internal/agencies/actions';
import { goLiveCopy } from '@/copy/go-live';
import { db, withOrg, withSystem } from '@/db/client';
import {
  devOutbox,
  events,
  joinRequests,
  lettings,
  memberships,
  organisationInvites,
  organisations,
  psraRegister,
  psraRegisterRefreshes,
  users,
  viewingSlots,
} from '@/db/schema';
import { listerFrom } from '@/domain/frame/frame';
import { RegisterFormatError } from '@/domain/register/parse';
import type { RegisterSource } from '@/ports/register';
import {
  askToJoin,
  claimAgency,
  findRegisterEntry,
  findRegisterEntryByLicence,
  pendingJoinRequests,
  searchRegister,
  startAgencyWithoutLicence,
} from '@/server/accounts/agencies';
import { sendAccountEmail } from '@/server/accounts/emails';
import { acceptInvites, purgeExpiredInvites } from '@/server/accounts/invites';
import { agenciesWaitingFor, confirmAgency, createPilotAgency } from '@/server/accounts/staff';
import type * as memberModule from '@/server/auth/member';
import { findMember, holdingsOf } from '@/server/auth/member';
import { type Staff, staffFrom } from '@/server/auth/staff';
import { createLetting } from '@/server/lettings/create-letting';
import { goLiveGateFor, startTakingEnquiries } from '@/server/lettings/go-live';
import { recordRentCheck } from '@/server/lettings/rent-check';
import { setCriteria } from '@/server/lettings/set-criteria';
import { addViewingSession } from '@/server/lettings/viewing-sessions';
import { queueRegisterRefreshIfDue, refreshRegister } from '@/server/register/refresh';
import { openRenterPage } from '@/server/renter/answers';
import { aLetting, aViewingSession } from '../fixtures/lettings';
import {
  aLiveLetting,
  aRegisterEntry,
  aRenterEnquires,
  createTestMember,
  createTestPerson,
  queuedJobs,
  renterTokenFor,
  type Member,
} from './helpers';

type User = { id: string; name: string; email: string; emailVerified: boolean };

// Who is signed in comes from the request's session cookie. Here the test says who it is.
const signedIn = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/server/auth/member', async (original) => ({
  ...(await original<typeof memberModule>()),
  currentUser: async () => signedIn.user,
}));

/** What Next.js throws for notFound(): the page answers 404. */
const NOT_FOUND = { digest: expect.stringContaining('404') };

/** The one made-up person on Gaff's own team (tests/integration/setup-env.ts). */
async function aStaffMember(): Promise<{ staff: Staff; user: User }> {
  const email = 'founder@staff.gaff.test';
  await db()
    .insert(users)
    .values({ id: crypto.randomUUID(), name: 'Sean Founder', email, emailVerified: true })
    .onConflictDoNothing();
  const [user] = await db().select().from(users).where(eq(users.email, email));
  const staff = staffFrom(user);
  if (!staff || !user) throw new Error('the staff member was not made');
  return { staff, user };
}

/** A made-up register in the expected format, with licence numbers no other test has. */
function aRegister(prefix: string, rows: Array<[number: string, name: string, trading?: string]>) {
  const csv = [
    'Licence Number,Licensee Name,Trading Name,Licence Type,Licence Category,County',
    ...rows.map(
      ([number, name, trading]) => `${prefix}${number},${name},${trading ?? ''},Company,C,Dublin`,
    ),
  ].join('\n');
  const source: RegisterSource = { name: 'sample', read: async () => csv };
  return { source, refresh: (now?: Date) => refreshRegister(source, now, prefix) };
}

/**
 * The start of licence numbers that only one test uses: 4 and three digits, so a refresh in one
 * test never touches another's entries. (Other tests' made-up numbers start with 9, and the
 * sample register's with 0.)
 */
let prefixes = 0;
const aPrefix = () => `4${String((prefixes += 1)).padStart(3, '0')}`;

/** A letting that is set up and ready to go live, but not live. */
async function aLettingReadyToGoLive(member: Member): Promise<string> {
  const { lettingId } = await createLetting(member, aLetting());
  await addViewingSession(member, lettingId, aViewingSession());
  await setCriteria(member, lettingId, { maxOccupants: 3, noPets: true });
  await recordRentCheck(member, lettingId, { lastLet: 'never' }, 185_000);
  return lettingId;
}

const lettingRow = async (member: Member, lettingId: string) =>
  (
    await withOrg(member.organisationId, (tx) =>
      tx.select().from(lettings).where(eq(lettings.id, lettingId)),
    )
  )[0]!;

const recordOf = (organisationId: string) =>
  withOrg(organisationId, (tx) =>
    tx
      .select({ type: events.type, actor: events.actorType, data: events.data })
      .from(events)
      .where(eq(events.organisationId, organisationId))
      .orderBy(asc(events.id)),
  );

const accountEmails = async (organisationId: string) =>
  (await queuedJobs('send_account_email')).filter((job) => job.organisationId === organisationId);

/** A person who has claimed an agency from the register: it is "being confirmed". */
async function anAgencyBeingConfirmed(name = `Halcyon ${crypto.randomUUID().slice(0, 6)}`) {
  const person = await createTestPerson();
  const entry = await aRegisterEntry({ registeredName: `${name} Limited`, tradingName: name });
  const claimed = await claimAgency(person, entry.id);
  if (claimed.result !== 'created') throw new Error('the agency was not set up');
  const member = (await findMember(person.id, claimed.organisationId))!;
  return { person, entry, member, organisationId: claimed.organisationId };
}

beforeEach(() => {
  signedIn.user = null;
});

describe('UX-AG-1, Q39: Gaff’s copy of the PSRA register', () => {
  it('holds businesses licensed to let, and never an individual’s own licence', async () => {
    // The made-up sample: 12 businesses licensed to let, 2 that aren't, and 3 people.
    const refreshed = await refreshRegister(sampleRegisterSource, new Date(), '0012');
    expect(refreshed.entries).toBe(12);
    const stored = await db()
      .select()
      .from(psraRegister)
      .where(like(psraRegister.licenceNumber, '0012%'));
    expect(stored).toHaveLength(12);
    expect(stored.every((entry) => /^\d{6}$/.test(entry.licenceNumber))).toBe(true);
    const text = JSON.stringify(stored);
    // People's own licences, and businesses not licensed to let, are nowhere in the copy.
    for (const dropped of ['Whelan', 'Farrell', 'Tierney', 'Slaney', 'Blackwater', '004501']) {
      expect(text).not.toContain(dropped);
    }
    expect(stored.find((entry) => entry.licenceNumber === '001234')).toMatchObject({
      registeredName: 'Halcyon Lettings Limited',
      tradingName: 'Halcyon Lettings',
      licenceType: 'company',
      county: 'Dublin',
      searchText: 'halcyon lettings limited halcyon lettings',
      removedAt: null,
    });
  });

  it('refreshing again changes nothing, and each refresh is recorded as counts', async () => {
    const prefix = aPrefix();
    const register = aRegister(prefix, [
      ['1', 'Corrib Homes Limited'],
      ['2', 'Tolka Park Lettings Limited', 'Tolka Park'],
    ]);
    expect(await register.refresh()).toEqual({
      entries: 2,
      added: 2,
      removed: 0,
      lapsed: 0,
      renewed: 0,
    });
    const at = new Date(Date.now() + 1000);
    expect(await register.refresh(at)).toMatchObject({ entries: 2, added: 0, removed: 0 });
    const [recorded] = await db()
      .select()
      .from(psraRegisterRefreshes)
      .where(eq(psraRegisterRefreshes.finishedAt, at));
    expect(recorded).toMatchObject({ source: 'sample', entries: 2, added: 0, removed: 0 });
  });

  it('a name that changes on the register changes in the copy, on the same entry', async () => {
    const prefix = aPrefix();
    await aRegister(prefix, [['1', 'Corrib Homes Limited']]).refresh();
    const [before] = await db()
      .select()
      .from(psraRegister)
      .where(eq(psraRegister.licenceNumber, `${prefix}1`));
    await aRegister(prefix, [['1', 'Corrib Homes Limited', 'Corrib Lettings']]).refresh();
    const [after] = await db()
      .select()
      .from(psraRegister)
      .where(eq(psraRegister.licenceNumber, `${prefix}1`));
    expect(after).toMatchObject({ id: before!.id, tradingName: 'Corrib Lettings' });
    expect(after!.searchText).toBe('corrib homes limited corrib lettings');
  });

  it('a file that isn’t the expected format fails loudly, and the copy stays as it was', async () => {
    const prefix = aPrefix();
    await aRegister(prefix, [['1', 'Corrib Homes Limited']]).refresh();
    const broken: RegisterSource = {
      name: 'sample',
      read: async () => `Number,Name\n${prefix}1,Somebody Else Limited`,
    };
    await expect(refreshRegister(broken, new Date(), prefix)).rejects.toBeInstanceOf(
      RegisterFormatError,
    );
    const [kept] = await db()
      .select()
      .from(psraRegister)
      .where(eq(psraRegister.licenceNumber, `${prefix}1`));
    expect(kept).toMatchObject({ registeredName: 'Corrib Homes Limited', removedAt: null });
  });

  it('UX-AG-6: a download cut short is refused, so nobody is told their licence lapsed', async () => {
    const prefix = aPrefix();
    const all = Array.from({ length: 30 }, (_, n): [string, string] => [
      String(n + 1).padStart(3, '0'),
      `Agency ${n + 1} Limited`,
    ]);
    await aRegister(prefix, all).refresh();
    await expect(aRegister(prefix, all.slice(0, 5)).refresh()).rejects.toThrow(
      /lists 5 businesses licensed to let, and Gaff's copy has 30/,
    );
    const still = await db()
      .select()
      .from(psraRegister)
      .where(like(psraRegister.licenceNumber, `${prefix}%`));
    expect(still.filter((entry) => entry.removedAt === null)).toHaveLength(30);
  });

  it('the refresh is queued when the copy is a week old, and not before', async () => {
    const prefix = aPrefix();
    const now = new Date('2031-03-03T03:15:00Z');
    await aRegister(prefix, [['1', 'Corrib Homes Limited']]).refresh(now);
    const day = 86_400_000;
    expect(await queueRegisterRefreshIfDue(new Date(now.getTime() + 2 * day))).toBe(false);
    expect(await queueRegisterRefreshIfDue(new Date(now.getTime() + 7 * day))).toBe(true);
    expect(await queuedJobs('psra_register_refresh')).toHaveLength(1);
    // Queued twice, it is still one job.
    await queueRegisterRefreshIfDue(new Date(now.getTime() + 8 * day));
    expect(await queuedJobs('psra_register_refresh')).toHaveLength(1);
  });
});

describe('UX-AG-1 to UX-AG-3: finding an agency', () => {
  it('UX-AG-1: finds it by name as typed, with its names, county and licence number', async () => {
    const unique = `Zephyr${crypto.randomUUID().slice(0, 6)}`;
    const entry = await aRegisterEntry({
      registeredName: `${unique} Property Limited`,
      tradingName: `${unique} Lettings`,
      county: 'Galway',
    });
    for (const typed of [unique.slice(0, 8), `${unique} lett`, unique.toUpperCase()]) {
      expect(await searchRegister(typed)).toEqual([
        {
          id: entry.id,
          licenceNumber: entry.licenceNumber,
          registeredName: `${unique} Property Limited`,
          tradingName: `${unique} Lettings`,
          licenceType: 'company',
          county: 'Galway',
          onGaff: false,
        },
      ]);
    }
    expect(await searchRegister(`${unique} cork`)).toEqual([]);
    expect(await searchRegister('z')).toEqual([]);
  });

  it('UX-AG-1: an entry that has left the register is never offered', async () => {
    const prefix = aPrefix();
    const unique = `Quill${crypto.randomUUID().slice(0, 6)}`;
    await aRegister(prefix, [
      ['1', `${unique} Homes Limited`],
      ['2', 'Tolka Park Lettings Limited'],
    ]).refresh();
    expect(await searchRegister(unique)).toHaveLength(1);
    await aRegister(prefix, [['2', 'Tolka Park Lettings Limited']]).refresh();
    expect(await searchRegister(unique)).toEqual([]);
    expect((await findRegisterEntryByLicence(`${prefix}1`)).ok).toBe(false);
  });

  it('UX-AG-2: "Enter the licence number instead" finds it, or says what to check', async () => {
    const entry = await aRegisterEntry({ licenceNumber: `9${String(Date.now()).slice(-6)}` });
    const found = await findRegisterEntryByLicence(` ${entry.licenceNumber} `);
    expect(found).toMatchObject({ ok: true, entry: { id: entry.id } });
    expect(await findRegisterEntryByLicence('0000001')).toEqual({
      ok: false,
      error:
        'We can’t find that number among the agencies licensed to let. Check it against your licence.',
    });
    expect(await findRegisterEntryByLicence('PSR')).toMatchObject({ ok: false });
  });

  it('UX-AG-3: an agency that is on Gaff says so, and the one action records a request', async () => {
    const admin = await createTestMember({ organisation: 'Liffey Quay' });
    const [held] = await db()
      .select({ entryId: organisations.psraRegisterEntryId })
      .from(organisations)
      .where(eq(organisations.id, admin.organisationId));
    const entryId = held!.entryId;
    expect((await findRegisterEntry(entryId!))?.onGaff).toBe(true);

    const colleague = await createTestPerson({ name: 'Brian Daly' });
    expect(await claimAgency(colleague, entryId!)).toEqual({
      result: 'already_on_gaff',
      agencyName: 'Liffey Quay',
    });
    expect(await askToJoin(colleague, entryId!)).toEqual({ agencyName: 'Liffey Quay' });
    await askToJoin(colleague, entryId!);

    // Recorded for that agency's admins (WP-19 shows and answers it), once.
    const forAdmins = await withOrg(admin.organisationId, (tx) => tx.select().from(joinRequests));
    expect(forAdmins).toHaveLength(1);
    expect(forAdmins[0]).toMatchObject({ userId: colleague.id, answeredAt: null, answer: null });
    expect((await recordOf(admin.organisationId)).at(-1)).toMatchObject({
      type: 'member.join_requested',
      actor: 'person',
      data: { requestId: forAdmins[0]!.id },
    });
    // The person sees their own request; another agency sees nothing of it.
    expect(await pendingJoinRequests(colleague.id)).toMatchObject([
      { organisationId: admin.organisationId, agencyName: 'Liffey Quay' },
    ]);
    const other = await createTestMember();
    expect(await withOrg(other.organisationId, (tx) => tx.select().from(joinRequests))).toEqual([]);
    expect(await pendingJoinRequests(other.userId)).toEqual([]);
    // Asking isn't joining.
    expect((await holdingsOf(colleague.id)).members).toEqual([]);
  });

  it('Q32: a claim nobody has confirmed holds nothing: the real agency can still claim it', async () => {
    const squatter = await anAgencyBeingConfirmed('Harbour Row');
    expect((await findRegisterEntry(squatter.entry.id))?.onGaff).toBe(false);
    const real = await createTestPerson({ name: 'Orla Byrne' });
    const claimed = await claimAgency(real, squatter.entry.id);
    expect(claimed.result).toBe('created');
    // Nobody is asked to join an agency that nobody has confirmed.
    await expect(askToJoin(real, squatter.entry.id)).rejects.toThrow(/isn’t on Gaff yet/);

    // Someone at Gaff confirms the real one. The other can never be confirmed for that licence.
    const { staff } = await aStaffMember();
    if (claimed.result !== 'created') throw new Error('unreachable');
    await confirmAgency(staff, claimed.organisationId);
    await expect(confirmAgency(staff, squatter.organisationId)).rejects.toThrow(
      'A confirmed agency on Gaff already holds this licence.',
    );
    const waiting = await agenciesWaitingFor(staff);
    expect(waiting.find((a) => a.organisationId === squatter.organisationId)).toMatchObject({
      licenceTaken: true,
    });
  });
});

describe('UX-AG-4: an agency is "being confirmed" until someone at Gaff confirms it', () => {
  it('nobody types a licence: the agency is set up from its entry in the register', async () => {
    const { entry, member, organisationId } = await anAgencyBeingConfirmed('Rowan & Byrne');
    const [agency] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    expect(agency).toMatchObject({
      kind: 'agency',
      // UX-AC-9: the name renters see is its trading name.
      name: 'Rowan & Byrne',
      psraLicenceNumber: entry.licenceNumber,
      psraRegisterEntryId: entry.id,
      confirmedAt: null,
      confirmedBy: null,
      licenceLapsedAt: null,
    });
    expect(member).toMatchObject({ role: 'admin', organisationKind: 'agency' });
    expect((await goLiveGateFor(member)).gate).toEqual({
      open: false,
      reason: 'being_confirmed',
      waits: true,
    });
  });

  it('pressing "Yes, that’s us" twice makes one agency', async () => {
    const person = await createTestPerson();
    const entry = await aRegisterEntry();
    const first = await claimAgency(person, entry.id);
    const second = await claimAgency(person, entry.id);
    expect(second).toEqual(first);
    expect((await holdingsOf(person.id)).members).toHaveLength(1);
  });

  it('the admin can do everything except put a letting live: go-live waits', async () => {
    const { member } = await anAgencyBeingConfirmed();
    // Adding a letting, viewing times, criteria and the rent check all work.
    const lettingId = await aLettingReadyToGoLive(member);
    expect(await startTakingEnquiries(member, lettingId)).toBe('held');
    const held = await lettingRow(member, lettingId);
    expect(held).toMatchObject({ stage: 'setup', status: 'draft', liveAt: null });
    expect(held.goLiveHeldAt).toBeInstanceOf(Date);
    // ADR-0007: the decision to go live is the member's, recorded when they made it.
    const record = await recordOf(member.organisationId);
    expect(record.at(-1)).toMatchObject({
      type: 'letting.go_live_held',
      actor: 'person',
      data: { decisionId: held.goLiveDecisionId, reason: 'being_confirmed' },
    });
    expect(record.map((event) => event.type)).not.toContain('letting.went_live');
    // Pressing again changes nothing.
    expect(await startTakingEnquiries(member, lettingId)).toBe('held');
    expect((await recordOf(member.organisationId)).length).toBe(record.length);
  });

  it('when someone at Gaff presses Confirm, the home goes live and the admin is emailed', async () => {
    const { member, organisationId } = await anAgencyBeingConfirmed('Tolka Park Lettings');
    const lettingId = await aLettingReadyToGoLive(member);
    await startTakingEnquiries(member, lettingId);
    const decisionId = (await lettingRow(member, lettingId)).goLiveDecisionId;

    const { staff, user } = await aStaffMember();
    const waiting = await agenciesWaitingFor(staff);
    expect(waiting.find((agency) => agency.organisationId === organisationId)).toMatchObject({
      name: 'Tolka Park Lettings',
      registeredName: 'Tolka Park Lettings Limited',
      licenceType: 'company',
      county: 'Dublin',
      admins: [{ name: member.name, email: member.email }],
      licenceTaken: false,
    });

    expect(await confirmAgency(staff, organisationId)).toEqual({ confirmed: true, wentLive: 1 });
    const [agency] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    expect(agency!.confirmedAt).toBeInstanceOf(Date);
    expect(agency!.confirmedBy).toBe(user.id);
    expect(await lettingRow(member, lettingId)).toMatchObject({
      stage: 'enquiries',
      status: 'live',
      goLiveHeldAt: null,
    });
    const record = await recordOf(organisationId);
    // Q13: staff confirmed the agency, and that is all they did. The home went live on the
    // member's own decision, made earlier; the system carried it out.
    expect(record.filter((event) => event.actor === 'staff')).toEqual([
      { type: 'organisation.confirmed', actor: 'staff', data: { how: 'checked' } },
    ]);
    expect(record.at(-1)).toEqual({
      type: 'letting.went_live',
      actor: 'system',
      data: { decisionId },
    });
    expect(await accountEmails(organisationId)).toEqual([
      { kind: 'agency_confirmed', organisationId, wentLive: 1 },
    ]);
    expect((await agenciesWaitingFor(staff)).map((a) => a.organisationId)).not.toContain(
      organisationId,
    );
    // Confirming is once per agency.
    expect(await confirmAgency(staff, organisationId)).toEqual({ confirmed: false, wentLive: 0 });
    expect((await goLiveGateFor(member)).gate).toEqual({ open: true });
  });

  it('a home whose set-up was undone while it waited doesn’t go live', async () => {
    const { member, organisationId } = await anAgencyBeingConfirmed();
    const lettingId = await aLettingReadyToGoLive(member);
    await startTakingEnquiries(member, lettingId);
    // The viewing times are taken away while the agency waits, so the home isn't ready.
    await withOrg(organisationId, (tx) =>
      tx.delete(viewingSlots).where(eq(viewingSlots.lettingId, lettingId)),
    );
    const { staff } = await aStaffMember();
    expect(await confirmAgency(staff, organisationId)).toEqual({ confirmed: true, wentLive: 0 });
    expect(await lettingRow(member, lettingId)).toMatchObject({
      stage: 'setup',
      status: 'draft',
      goLiveHeldAt: null,
    });
    expect((await recordOf(organisationId)).at(-1)).toMatchObject({
      type: 'letting.go_live_hold_ended',
      data: { reason: 'not_ready' },
    });
  });

  it('the email to the admin says what happened, in the email layout, with one button', async () => {
    const { member, organisationId } = await anAgencyBeingConfirmed('Lee Valley Lettings');
    const { staff } = await aStaffMember();
    await confirmAgency(staff, organisationId);
    await sendAccountEmail({ kind: 'agency_confirmed', organisationId, wentLive: 1 });
    const [email] = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, member.email));
    expect(email!.subject).toBe('Lee Valley Lettings is confirmed on Gaff');
    expect(email!.text).toContain('We’ve confirmed Lee Valley Lettings on Gaff.');
    expect(email!.text).toContain('The home you were ready to put live is live now');
    expect(email!.html).toContain('data-email="button"');
    expect(email!.html).toContain('>Open Gaff</a>');
    expect(email!.html!.match(/data-email="button"/g)).toHaveLength(1);
  });
});

describe('UX-AG-4, Q13: the confirm action is for Gaff’s own team, and nobody else', () => {
  it('someone who isn’t signed in gets a 404, and nothing is confirmed', async () => {
    const { organisationId } = await anAgencyBeingConfirmed();
    await expect(confirmAgencyAction(organisationId)).rejects.toMatchObject(NOT_FOUND);
    const [agency] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    expect(agency!.confirmedAt).toBeNull();
  });

  it('the agency’s own admin can’t confirm their own agency', async () => {
    const { person, organisationId } = await anAgencyBeingConfirmed();
    signedIn.user = person;
    await expect(confirmAgencyAction(organisationId)).rejects.toMatchObject(NOT_FOUND);
    const [agency] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    expect(agency!.confirmedAt).toBeNull();
  });

  it('an admin of another, confirmed agency can’t either, nor someone unverified on the list', async () => {
    const { organisationId } = await anAgencyBeingConfirmed();
    const other = await createTestMember();
    signedIn.user = { id: other.userId, name: other.name, email: other.email, emailVerified: true };
    await expect(confirmAgencyAction(organisationId)).rejects.toMatchObject(NOT_FOUND);
    signedIn.user = {
      id: crypto.randomUUID(),
      name: 'Not Sean',
      email: 'founder@staff.gaff.test',
      emailVerified: false,
    };
    await expect(confirmAgencyAction(organisationId)).rejects.toMatchObject(NOT_FOUND);
    // Setting up a pilot agency is staff-only in the same way.
    const form = new FormData();
    form.set('licenceNumber', '001234');
    form.set('adminEmail', 'ann@halcyon.test');
    await expect(createPilotAgencyAction({}, form)).rejects.toMatchObject(NOT_FOUND);
  });

  it('Q13: confirming touches the agency and nothing in it: no renter’s page changes hands', async () => {
    // A confirmed agency with a live letting and a renter: staff have no way in to either.
    const member = await createTestMember();
    await aLiveLetting(member);
    const applicationId = await aRenterEnquires(member, 1);
    const token = await renterTokenFor(member, applicationId);
    const { staff } = await aStaffMember();
    // What staff are shown is agencies waiting: this one, with its lettings and renters, isn't.
    const shown = JSON.stringify(await agenciesWaitingFor(staff));
    expect(shown).not.toContain(member.organisationId);
    expect(shown).not.toContain(applicationId);
    // And a Staff is not a Member: the workspace's use cases don't accept one.
    expect(await findMember(staff.userId, member.organisationId)).toBeNull();
    expect(await openRenterPage(token)).not.toBeNull();
  });
});

describe('UX-AG-2: an agency applying for its licence', () => {
  it('sets everything up, and no letting goes live until a licence is found', async () => {
    const person = await createTestPerson();
    const { organisationId } = await startAgencyWithoutLicence(person, ' Barrow Valley Estates ');
    const member = (await findMember(person.id, organisationId))!;
    expect(member).toMatchObject({ organisationName: 'Barrow Valley Estates', role: 'admin' });
    const lettingId = await aLettingReadyToGoLive(member);
    await expect(startTakingEnquiries(member, lettingId)).rejects.toThrow(
      goLiveCopy.held.no_licence('Barrow Valley Estates'),
    );
    expect(await lettingRow(member, lettingId)).toMatchObject({
      status: 'draft',
      goLiveHeldAt: null,
    });
    // Someone at Gaff can't confirm an agency with no licence to match.
    const { staff } = await aStaffMember();
    await expect(confirmAgency(staff, organisationId)).rejects.toThrow(/no licence/);

    // The licence comes through: they find it, and it joins the agency they already set up.
    const entry = await aRegisterEntry({ registeredName: 'Barrow Valley Estates Limited' });
    expect(await claimAgency(person, entry.id)).toEqual({ result: 'created', organisationId });
    expect((await holdingsOf(person.id)).members).toHaveLength(1);
    expect((await recordOf(organisationId)).at(-1)).toMatchObject({
      type: 'organisation.licence_found',
      data: { registerEntryId: entry.id },
    });
    expect((await goLiveGateFor(member)).gate).toMatchObject({ reason: 'being_confirmed' });
    await confirmAgency(staff, organisationId);
    expect(await startTakingEnquiries(member, lettingId)).toBe('live');
  });

  it('asks for the agency’s name in plain words', async () => {
    const person = await createTestPerson();
    await expect(startAgencyWithoutLicence(person, ' ')).rejects.toThrow(
      'Enter the name of your agency',
    );
  });
});

describe('UX-AG-5: a founder sets a pilot agency up, and the invitation is the confirmation', () => {
  it('the agency arrives confirmed, and its first admin joins with no questions', async () => {
    const { staff, user } = await aStaffMember();
    const entry = await aRegisterEntry({
      registeredName: 'Shannonside Property Services Limited',
      tradingName: 'Shannonside Lettings',
      licenceNumber: `8${String(Date.now()).slice(-6)}`,
    });
    const invited = `orla.${crypto.randomUUID().slice(0, 8)}@shannonside.test`;
    const created = await createPilotAgency(staff, {
      licenceNumber: entry.licenceNumber,
      adminEmail: `  ${invited.toUpperCase()} `,
    });
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    expect(created.agencyName).toBe('Shannonside Lettings');
    const [agency] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, created.organisationId));
    expect(agency).toMatchObject({
      kind: 'agency',
      psraLicenceNumber: entry.licenceNumber,
      confirmedBy: user.id,
    });
    expect(agency!.confirmedAt).toBeInstanceOf(Date);
    const record = await recordOf(created.organisationId);
    expect(record.map((event) => [event.type, event.actor])).toEqual([
      ['organisation.created', 'system'],
      ['organisation.confirmed', 'staff'],
      ['member.invited', 'staff'],
    ]);
    expect(record[1]!.data).toEqual({ how: 'invited' });
    // Rule 8: the record holds the invite's ID, never the address.
    expect(JSON.stringify(record)).not.toContain('shannonside.test');

    // The invitation goes by email, with one button.
    const [job] = await accountEmails(created.organisationId);
    expect(job).toMatchObject({ kind: 'agency_invite' });
    await sendAccountEmail(job);
    const [email] = await db().select().from(devOutbox).where(eq(devOutbox.toAddress, invited));
    expect(email!.subject).toBe('Join Shannonside Lettings on Gaff');
    expect(email!.text).toContain('invited you to run it, as its first admin');
    expect(email!.html).toContain('>Join Shannonside Lettings</a>');
    expect(email!.text).toMatch(/\/join\n/);

    // Someone else signing in doesn't get it. The invited person does, once verified.
    const stranger = await createTestPerson();
    expect(await acceptInvites(stranger)).toEqual([]);
    const unverified = await createTestPerson({ email: invited, emailVerified: false });
    expect(await acceptInvites(unverified)).toEqual([]);
    await db().update(users).set({ emailVerified: true }).where(eq(users.id, unverified.id));
    const orla = { ...unverified, emailVerified: true };
    expect(await acceptInvites(orla)).toEqual([created.organisationId]);

    const member = await findMember(orla.id);
    expect(member).toMatchObject({
      organisationId: created.organisationId,
      organisationName: 'Shannonside Lettings',
      role: 'admin',
    });
    // An invite works once, and its address is gone with it.
    expect(await acceptInvites(orla)).toEqual([]);
    expect(
      await withSystem((tx) =>
        tx.select().from(organisationInvites).where(eq(organisationInvites.email, invited)),
      ),
    ).toEqual([]);
    // No waiting: their first home can go live straight away.
    const lettingId = await aLettingReadyToGoLive(member!);
    expect(await startTakingEnquiries(member!, lettingId)).toBe('live');
  });

  it('says what’s wrong at the field: a number not on the register, or not an address', async () => {
    const { staff } = await aStaffMember();
    expect(await createPilotAgency(staff, { licenceNumber: '0000002', adminEmail: 'ann' })).toEqual(
      {
        ok: false,
        errors: { adminEmail: 'Enter the first admin’s email address, like ann@example.ie' },
      },
    );
    expect(
      await createPilotAgency(staff, { licenceNumber: '0000002', adminEmail: 'ann@halcyon.test' }),
    ).toEqual({
      ok: false,
      errors: { licenceNumber: 'That number isn’t among the agencies licensed to let.' },
    });
  });

  it('an agency that is already confirmed on Gaff isn’t set up twice', async () => {
    const { staff } = await aStaffMember();
    const entry = await aRegisterEntry({ licenceNumber: `7${String(Date.now()).slice(-6)}` });
    const first = await createPilotAgency(staff, {
      licenceNumber: entry.licenceNumber,
      adminEmail: 'first@pilot.test',
    });
    expect(first.ok).toBe(true);
    expect(
      await createPilotAgency(staff, {
        licenceNumber: entry.licenceNumber,
        adminEmail: 'second@pilot.test',
      }),
    ).toEqual({
      ok: false,
      errors: { licenceNumber: 'That agency is already on Gaff, and confirmed.' },
    });
  });

  it('rule 9: an invite nobody answered is deleted once it has expired', async () => {
    const { staff } = await aStaffMember();
    const entry = await aRegisterEntry({ licenceNumber: `6${String(Date.now()).slice(-6)}` });
    const address = `late.${crypto.randomUUID().slice(0, 8)}@pilot.test`;
    const created = await createPilotAgency(staff, {
      licenceNumber: entry.licenceNumber,
      adminEmail: address,
    });
    if (!created.ok) throw new Error('the pilot agency was not set up');
    const invites = () =>
      withOrg(created.organisationId, (tx) => tx.select().from(organisationInvites));
    const [invite] = await invites();
    const days = (invite!.expiresAt.getTime() - invite!.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
    // Eight days on, it no longer works.
    const person = await createTestPerson({ email: address });
    expect(await acceptInvites(person, new Date(Date.now() + 8 * 86_400_000))).toEqual([]);
    expect(await invites()).toHaveLength(1);

    // The daily job deletes an invite that has expired, and never one that still stands.
    const stillGood = await createPilotAgencyInvite(staff);
    await withOrg(created.organisationId, (tx) =>
      tx
        .update(organisationInvites)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(organisationInvites.id, invite!.id)),
    );
    await withSystem((tx) => purgeExpiredInvites(tx, new Date()));
    expect(await invites()).toEqual([]);
    expect(await withOrg(stillGood, (tx) => tx.select().from(organisationInvites))).toHaveLength(1);
  });
});

/** A pilot agency with an invite that has a week to run. Returns the organisation. */
async function createPilotAgencyInvite(staff: Staff): Promise<string> {
  const entry = await aRegisterEntry({
    licenceNumber: `5${String(Date.now()).slice(-6)}`,
  });
  const created = await createPilotAgency(staff, {
    licenceNumber: entry.licenceNumber,
    adminEmail: `good.${crypto.randomUUID().slice(0, 8)}@pilot.test`,
  });
  if (!created.ok) throw new Error('the pilot agency was not set up');
  return created.organisationId;
}

describe('UX-AG-6: the weekly re-check against the register', () => {
  /** A confirmed agency holding an entry from a made-up register only this test refreshes. */
  async function aConfirmedAgencyOn(prefix: string, name: string) {
    await aRegister(prefix, [
      ['1', `${name} Limited`, name],
      ['2', 'Tolka Park Lettings Limited'],
    ]).refresh();
    const [entry] = await db()
      .select()
      .from(psraRegister)
      .where(eq(psraRegister.licenceNumber, `${prefix}1`));
    const person = await createTestPerson();
    const claimed = await claimAgency(person, entry!.id);
    if (claimed.result !== 'created') throw new Error('the agency was not set up');
    const { staff } = await aStaffMember();
    await confirmAgency(staff, claimed.organisationId);
    const member = (await findMember(person.id, claimed.organisationId))!;
    return { member, organisationId: claimed.organisationId, entry: entry! };
  }
  const withoutIt = (prefix: string) => aRegister(prefix, [['2', 'Tolka Park Lettings Limited']]);

  it('a lapsed licence tells the admins at once and stops new lettings going live', async () => {
    const prefix = aPrefix();
    const { member, organisationId, entry } = await aConfirmedAgencyOn(prefix, 'Moy Lettings');
    const { lettingId: live } = await aLiveLetting(member);
    const waiting = await aLettingReadyToGoLive(member);

    // This week's register no longer lists the agency.
    const refreshed = await withoutIt(prefix).refresh();
    expect(refreshed).toMatchObject({ removed: 1, lapsed: 1, renewed: 0 });
    const [agency] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    expect(agency!.licenceLapsedAt).toBeInstanceOf(Date);
    // It stays confirmed: who works there hasn't changed.
    expect(agency!.confirmedAt).toBeInstanceOf(Date);
    expect((await recordOf(organisationId)).at(-1)).toEqual({
      type: 'organisation.licence_lapsed',
      actor: 'system',
      data: { registerEntryId: entry.id },
    });
    expect(await accountEmails(organisationId)).toContainEqual({
      kind: 'licence_lapsed',
      organisationId,
    });

    // Live lettings carry on. No new letting goes live, and nothing is left waiting.
    expect(await lettingRow(member, live)).toMatchObject({ status: 'live', stage: 'enquiries' });
    await expect(startTakingEnquiries(member, waiting)).rejects.toThrow(
      goLiveCopy.held.licence_lapsed('Moy Lettings'),
    );
    expect(await lettingRow(member, waiting)).toMatchObject({
      status: 'draft',
      goLiveHeldAt: null,
    });
    // Everything else still works: another letting can be added and set up.
    await aLettingReadyToGoLive(member);

    // The email to the admins says so, in plain words.
    await sendAccountEmail({ kind: 'licence_lapsed', organisationId });
    const [email] = await db()
      .select()
      .from(devOutbox)
      .where(eq(devOutbox.toAddress, member.email));
    expect(email!.subject).toBe('Moy Lettings: your PSRA licence isn’t on this week’s register');
    expect(email!.text).toContain('The homes you have live carry on as they are.');
    expect(email!.text).toContain(`licence ${entry.licenceNumber}`);
  });

  it('a week that still lists it tells nobody anything', async () => {
    const prefix = aPrefix();
    const { organisationId } = await aConfirmedAgencyOn(prefix, 'Corrib Homes');
    const before = (await accountEmails(organisationId)).length;
    const again = await aRegister(prefix, [
      ['1', 'Corrib Homes Limited', 'Corrib Homes'],
      ['2', 'Tolka Park Lettings Limited'],
    ]).refresh();
    expect(again).toMatchObject({ lapsed: 0, renewed: 0 });
    expect(await accountEmails(organisationId)).toHaveLength(before);
  });

  it('once it’s renewed, the agency can put homes live again, and is told', async () => {
    const prefix = aPrefix();
    const { member, organisationId, entry } = await aConfirmedAgencyOn(prefix, 'Liffey Quay');
    const waiting = await aLettingReadyToGoLive(member);
    await withoutIt(prefix).refresh();
    // A second week without it tells them nothing new.
    const second = await withoutIt(prefix).refresh();
    expect(second).toMatchObject({ lapsed: 0, renewed: 0 });

    const back = await aRegister(prefix, [
      ['1', 'Liffey Quay Limited', 'Liffey Quay'],
      ['2', 'Tolka Park Lettings Limited'],
    ]).refresh();
    expect(back).toMatchObject({ lapsed: 0, renewed: 1 });
    const [agency] = await db()
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    expect(agency!.licenceLapsedAt).toBeNull();
    expect((await recordOf(organisationId)).at(-1)).toMatchObject({
      type: 'organisation.licence_renewed',
      data: { registerEntryId: entry.id },
    });
    expect((await accountEmails(organisationId)).map((job) => job.kind).sort()).toEqual([
      'agency_confirmed',
      'licence_lapsed',
      'licence_renewed',
    ]);
    expect(await startTakingEnquiries(member, waiting)).toBe('live');
  });

  it('an agency someone has yet to confirm is re-checked too, and can’t be confirmed lapsed', async () => {
    const prefix = aPrefix();
    await aRegister(prefix, [
      ['1', 'Harbour Row Residential Limited'],
      ['2', 'Tolka Park Lettings Limited'],
    ]).refresh();
    const [entry] = await db()
      .select()
      .from(psraRegister)
      .where(eq(psraRegister.licenceNumber, `${prefix}1`));
    const person = await createTestPerson();
    const claimed = await claimAgency(person, entry!.id);
    if (claimed.result !== 'created') throw new Error('the agency was not set up');
    await withoutIt(prefix).refresh();
    const { staff } = await aStaffMember();
    await expect(confirmAgency(staff, claimed.organisationId)).rejects.toThrow(
      'This agency’s licence isn’t on the register now.',
    );
    const members = await db()
      .select()
      .from(memberships)
      .where(eq(memberships.organisationId, claimed.organisationId));
    expect(members).toHaveLength(1);
  });
});

describe('UX-AG-7: the licence renters see comes from a confirmed agency’s register entry', () => {
  it('a renter’s page shows the licence of a confirmed agency', async () => {
    const member = await createTestMember({ organisation: 'Halcyon Lettings' });
    await aLiveLetting(member);
    const token = await renterTokenFor(member, await aRenterEnquires(member, 1));
    const page = await openRenterPage(token);
    expect(page?.organisation).toMatchObject({ name: 'Halcyon Lettings' });
    expect(listerFrom(page!.organisation).licence).toBe('001234');
    // The same agency, had nobody at Gaff confirmed it: no licence is shown in its name.
    expect(listerFrom({ ...page!.organisation, confirmedAt: null }).licence).toBeNull();
  });
});
