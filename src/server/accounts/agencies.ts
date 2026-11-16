import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db, scopeToOrg, scopeToPerson, type Tx, withOrg, withPerson } from '@/db/client';
import { joinRequests, memberships, organisations, psraRegister } from '@/db/schema';
import { agencyNameSchema, nameIsKnown } from '@/domain/accounts/first-run';
import type { BusinessLicenceType } from '@/domain/register/parse';
import {
  agencyNameFrom,
  licenceNumberSchema,
  matchesSearch,
  rankResults,
  searchTerms,
} from '@/domain/register/search';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { createOrganisationIn } from '@/server/organisations/create-organisation';
import { recordEvent } from '@/server/record/events';
import { oneAtATime, type SignedInPerson } from './contexts';
import { saveProfileIn } from './profile';

/**
 * UX-AG-1 to UX-AG-4: finding an agency on Gaff's copy of the PSRA register, and joining Gaff as
 * that agency. The register is public, so picking an agency proves nothing about the person who
 * picked it (Q32): an agency made here is "being confirmed" until someone at Gaff confirms it
 * (./staff.ts), and until then a claim holds nothing. Only a confirmed agency is "on Gaff".
 */
export interface RegisterResult {
  id: string;
  licenceNumber: string;
  registeredName: string;
  tradingName: string | null;
  licenceType: BusinessLicenceType;
  county: string;
  /** UX-AG-3: a confirmed agency on Gaff holds this entry. */
  onGaff: boolean;
}

const entryColumns = {
  id: psraRegister.id,
  licenceNumber: psraRegister.licenceNumber,
  registeredName: psraRegister.registeredName,
  tradingName: psraRegister.tradingName,
  licenceType: psraRegister.licenceType,
  county: psraRegister.county,
};

async function withOnGaff(
  entries: Array<Omit<RegisterResult, 'onGaff'>>,
): Promise<RegisterResult[]> {
  if (entries.length === 0) return [];
  const held = await db()
    .select({ entryId: organisations.psraRegisterEntryId })
    .from(organisations)
    .where(
      and(
        inArray(
          organisations.psraRegisterEntryId,
          entries.map((entry) => entry.id),
        ),
        isNotNull(organisations.confirmedAt),
      ),
    );
  const onGaff = new Set(held.map((row) => row.entryId));
  return entries.map((entry) => ({ ...entry, onGaff: onGaff.has(entry.id) }));
}

const asResult = (row: { licenceType: string } & Omit<RegisterResult, 'onGaff' | 'licenceType'>) =>
  ({ ...row, licenceType: row.licenceType as BusinessLicenceType }) satisfies Omit<
    RegisterResult,
    'onGaff'
  >;

/** UX-AG-1: the businesses licensed to let whose names match what was typed, best first. */
export async function searchRegister(typed: string): Promise<RegisterResult[]> {
  const terms = searchTerms(typed);
  if (terms.length === 0) return [];
  // Each word typed must start a word of the names. The database narrows; the rule decides.
  const candidates = await db()
    .select({ ...entryColumns, searchText: psraRegister.searchText })
    .from(psraRegister)
    .where(
      and(
        isNull(psraRegister.removedAt),
        ...terms.map((term) =>
          or(
            sql`${psraRegister.searchText} like ${`${term}%`}`,
            sql`${psraRegister.searchText} like ${`% ${term}%`}`,
          ),
        ),
      ),
    )
    .limit(200);
  const matching = candidates.filter((entry) => matchesSearch(entry.searchText, terms));
  return withOnGaff(
    rankResults(matching, typed).map(({ searchText: _searchText, ...entry }) => asResult(entry)),
  );
}

/** One entry of the register, if it's still on it. */
export async function findRegisterEntry(id: string): Promise<RegisterResult | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [entry] = await db()
    .select(entryColumns)
    .from(psraRegister)
    .where(and(eq(psraRegister.id, id), isNull(psraRegister.removedAt)));
  return entry ? ((await withOnGaff([asResult(entry)]))[0] ?? null) : null;
}

/** UX-AG-2: "Enter the licence number instead". */
export async function findRegisterEntryByLicence(
  typed: string,
): Promise<{ ok: true; entry: RegisterResult } | { ok: false; error: string }> {
  const parsed = licenceNumberSchema.safeParse(typed);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const [entry] = await db()
    .select(entryColumns)
    .from(psraRegister)
    .where(and(eq(psraRegister.licenceNumber, parsed.data), isNull(psraRegister.removedAt)));
  if (!entry) {
    return {
      ok: false,
      error:
        'We can’t find that number among the agencies licensed to let. Check it against your licence.',
    };
  }
  return { ok: true, entry: (await withOnGaff([asResult(entry)]))[0]! };
}

/** UX-AC-10: remembers that they said they work at an agency, and the one they picked, if any. */
export async function rememberAgencyStep(
  person: SignedInPerson,
  registerEntryId: string | null,
): Promise<void> {
  await withPerson(person.id, (tx) =>
    saveProfileIn(tx, person.id, {
      firstRunPurpose: 'agency',
      firstRunRegisterEntryId: registerEntryId,
    }),
  );
}

async function confirmedHolderOf(tx: Tx, registerEntryId: string) {
  const [holder] = await tx
    .select({ id: organisations.id, name: organisations.name })
    .from(organisations)
    .where(
      and(
        eq(organisations.psraRegisterEntryId, registerEntryId),
        isNotNull(organisations.confirmedAt),
      ),
    );
  return holder ?? null;
}

async function entryIn(tx: Tx, registerEntryId: string) {
  const [entry] = /^[0-9a-f-]{36}$/i.test(registerEntryId)
    ? await tx
        .select()
        .from(psraRegister)
        .where(and(eq(psraRegister.id, registerEntryId), isNull(psraRegister.removedAt)))
    : [];
  if (!entry) throw new UserFacingError('We couldn’t find that agency. Search for it again.');
  return entry;
}

function needName(person: SignedInPerson): void {
  if (!nameIsKnown(person.name)) throw new UserFacingError('Enter your name', 'name');
}

export type ClaimResult =
  /** The agency is set up, "being confirmed", with this person as its admin. */
  | { result: 'created'; organisationId: string }
  /** UX-AG-3: a confirmed agency already holds this licence. The one action is "Ask to join". */
  | { result: 'already_on_gaff'; agencyName: string };

/**
 * UX-AG-4: "Yes, that's us". Sets the agency up from its entry in the register: the name
 * renters see is its trading or registered name (UX-AC-9), and nobody types a licence number.
 * It is "being confirmed" until someone at Gaff confirms that this person works there.
 */
export async function claimAgency(
  person: SignedInPerson,
  registerEntryId: string,
): Promise<ClaimResult> {
  needName(person);
  return db().transaction(async (tx) => {
    await scopeToPerson(tx, person.id);
    await oneAtATime(tx, person.id);
    const entry = await entryIn(tx, registerEntryId);
    const holder = await confirmedHolderOf(tx, entry.id);
    const [own] = await tx
      .select({ organisationId: organisations.id })
      .from(memberships)
      .innerJoin(organisations, eq(organisations.id, memberships.organisationId))
      .where(
        and(eq(memberships.userId, person.id), eq(organisations.psraRegisterEntryId, entry.id)),
      );
    // Pressed twice, or they already belong to it: the same agency, not a second one.
    const organisationId =
      own?.organisationId ??
      (holder
        ? null
        : (
            await createOrganisationIn(tx, {
              kind: 'agency',
              name: agencyNameFrom(entry),
              psraRegisterEntryId: entry.id,
              psraLicenceNumber: entry.licenceNumber,
              adminUserId: person.id,
              actor: { type: 'person', userId: person.id },
            })
          ).organisationId);
    if (!organisationId) return { result: 'already_on_gaff', agencyName: holder!.name };
    await saveProfileIn(tx, person.id, {
      lastSide: 'letting',
      lastOrganisationId: organisationId,
      firstRunPurpose: null,
      firstRunRegisterEntryId: null,
    });
    return { result: 'created', organisationId };
  });
}

/**
 * UX-AG-2: "We're applying for a licence". The agency is set up with the name they give and no
 * licence, so they can get everything ready. No letting goes live until a licence is found.
 */
export async function startAgencyWithoutLicence(
  person: SignedInPerson,
  name: unknown,
): Promise<{ organisationId: string }> {
  needName(person);
  const parsed = agencyNameSchema.safeParse(name);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]!.message, 'agencyName');
  return db().transaction(async (tx) => {
    await scopeToPerson(tx, person.id);
    await oneAtATime(tx, person.id);
    const { organisationId } = await createOrganisationIn(tx, {
      kind: 'agency',
      name: parsed.data,
      adminUserId: person.id,
      actor: { type: 'person', userId: person.id },
    });
    await saveProfileIn(tx, person.id, {
      lastSide: 'letting',
      lastOrganisationId: organisationId,
      firstRunPurpose: null,
      firstRunRegisterEntryId: null,
    });
    return { organisationId };
  });
}

/**
 * UX-AG-2: an agency that was applying has its licence now: an admin finds it on the register.
 * The agency is then "being confirmed", like any other that signed up by itself.
 */
export async function attachLicence(member: Member, registerEntryId: string): Promise<void> {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can do this.');
  await withOrg(member.organisationId, async (tx) => {
    const entry = await entryIn(tx, registerEntryId);
    if (await confirmedHolderOf(tx, entry.id)) {
      throw new UserFacingError('That agency is already on Gaff. Ask one of its admins to add you.');
    }
    const updated = await tx
      .update(organisations)
      .set({ psraRegisterEntryId: entry.id, psraLicenceNumber: entry.licenceNumber })
      .where(
        and(
          eq(organisations.id, member.organisationId),
          eq(organisations.kind, 'agency'),
          isNull(organisations.psraRegisterEntryId),
        ),
      )
      .returning({ id: organisations.id });
    if (updated.length === 0) return;
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'organisation.licence_found',
      data: { registerEntryId: entry.id },
    });
  });
}

/**
 * UX-AG-3: "Ask to join" an agency that's already on Gaff. The request is recorded for that
 * agency's admins. Showing it to them and answering it is work package WP-19; until then it
 * waits. Asking twice makes one request.
 */
export async function askToJoin(
  person: SignedInPerson,
  registerEntryId: string,
): Promise<{ agencyName: string }> {
  needName(person);
  return db().transaction(async (tx) => {
    await scopeToPerson(tx, person.id);
    const entry = await entryIn(tx, registerEntryId);
    const holder = await confirmedHolderOf(tx, entry.id);
    if (!holder) throw new UserFacingError('That agency isn’t on Gaff yet. Search for it again.');
    // The request is the agency's to answer, so it's written in the agency's own rows.
    await scopeToOrg(tx, holder.id);
    const [request] = await tx
      .insert(joinRequests)
      .values({ organisationId: holder.id, userId: person.id })
      .onConflictDoNothing()
      .returning({ id: joinRequests.id });
    if (request) {
      await recordEvent(tx, {
        organisationId: holder.id,
        actor: { type: 'person', userId: person.id },
        type: 'member.join_requested',
        data: { requestId: request.id },
      });
    }
    await saveProfileIn(tx, person.id, {
      firstRunPurpose: 'agency',
      firstRunRegisterEntryId: entry.id,
    });
    return { agencyName: holder.name };
  });
}

/** The agencies this person has asked to join and not heard back from. Their own rows only. */
export async function pendingJoinRequests(
  userId: string,
): Promise<Array<{ organisationId: string; agencyName: string; requestedAt: Date }>> {
  return withPerson(userId, (tx) =>
    tx
      .select({
        organisationId: joinRequests.organisationId,
        agencyName: organisations.name,
        requestedAt: joinRequests.requestedAt,
      })
      .from(joinRequests)
      .innerJoin(organisations, eq(organisations.id, joinRequests.organisationId))
      .where(and(eq(joinRequests.userId, userId), isNull(joinRequests.answeredAt))),
  );
}
