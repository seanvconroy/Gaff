import { and, eq, isNull, sql } from 'drizzle-orm';
import { aiProvider } from '@/adapters/ai';
import { type Tx, withSystem } from '@/db/client';
import { lettingFacts, lettings, listingCases, organisations } from '@/db/schema';
import { reportDeleteAfter } from '@/domain/homes/report';
import { listerMayShowHomes, placeOf } from '@/domain/homes/home-page';
import { DUPLICATE_DISTANCE } from '@/domain/lettings/photo-files';
import { stripPersonalDetails } from '@/domain/lettings/advert-reading';
import {
  BURST_HOURS,
  type CheckPart,
  comparableDescription,
  holdDueBy,
  looksAt,
  MIN_DETAIL_BITS,
  type RiskSignal,
  riskSignalsFrom,
  signalsToHold,
  type WordingFinding,
} from '@/domain/listings/checks';
import { checkWordingReading } from '@/domain/listings/wording';
import type { AiProvider } from '@/ports/ai';
import { runAi } from '@/server/ai/usage';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/**
 * BA-10 (the live line's M29, M48; P12 to P14): the checks a home passes as it goes public on
 * gaff.ie, and again whenever a public home's words, photos or rent change.
 *
 * The risk signals read across listers (another lister's photos, rents and words), so they run
 * as the system, and only codes, counts and yes-or-no come back: never another lister's data.
 * A signal never decides anything. It holds the listing for a person on Gaff's team: a case of
 * kind `hold`, due in working hours, with the home off gaff.ie and its enquiries waiting exactly
 * as a hidden home's do. The lister is told at once, in fixed words, that a person will look and
 * by when (`listing_checking`). The person releases it or keeps it off with reasons
 * (src/server/trust/staff.ts), and the lister can appeal once.
 *
 * Only a home that is public, or about to be, is checked: live (or going live), "On gaff.ie"
 * on, with a BER and a photo, by a lister who may show it. A home that isn't public is checked
 * in full when it becomes so.
 */

/** Where a check came from. The parts say what changed, so only those are looked at again. */
export interface CheckRequest {
  organisationId: string;
  lettingId: string;
  part: CheckPart;
  /** With `photos`: the photos just added. The others were checked when they were added. */
  photoIds?: readonly string[];
}

export type CheckOutcome =
  | { outcome: 'skipped' }
  | { outcome: 'clear' }
  | { outcome: 'held'; caseId: string; signals: RiskSignal[] };

/** A letting as the checks read it. Its own data, read as the system with everything else. */
async function lettingFor(tx: Tx, lettingId: string) {
  const [row] = await tx
    .select({
      id: lettings.id,
      organisationId: lettings.organisationId,
      stage: lettings.stage,
      status: lettings.status,
      onGaff: lettings.onGaff,
      berRating: lettings.berRating,
      hiddenAt: lettings.hiddenAt,
      screenedAt: lettings.screenedAt,
      area: lettings.area,
      bedrooms: lettings.bedrooms,
      monthlyRentCents: lettings.monthlyRentCents,
      description: lettings.description,
      listerKind: organisations.kind,
      listerName: organisations.name,
      psraLicenceNumber: organisations.psraLicenceNumber,
      confirmedAt: organisations.confirmedAt,
      licenceLapsedAt: organisations.licenceLapsedAt,
      identityVerifiedAt: organisations.identityVerifiedAt,
      listingsPausedAt: organisations.listingsPausedAt,
      accountCreatedAt: organisations.createdAt,
      photos: sql<number>`(select count(*)::int from letting_photos p where p.letting_id = ${lettings.id} and p.kind = 'photo')`,
    })
    .from(lettings)
    .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
    .where(eq(lettings.id, lettingId));
  return row ?? null;
}

type LettingRead = NonNullable<Awaited<ReturnType<typeof lettingFor>>>;

/** What renters read about the home: its description and the facts its page lists. */
async function publicWordsOf(tx: Tx, letting: LettingRead): Promise<string> {
  const facts = await tx
    .select({ answer: lettingFacts.answer })
    .from(lettingFacts)
    .where(
      and(
        eq(lettingFacts.lettingId, letting.id),
        eq(lettingFacts.source, 'setup'),
        isNull(lettingFacts.retiredAt),
      ),
    );
  return [letting.description ?? '', ...facts.map((fact) => fact.answer)]
    .filter((text) => text.trim())
    .join('\n');
}

/**
 * Whether the home is public, or will be once it goes live: the one rule's parts that this
 * letting can know (`homePageState`), with what the go-live screen is about to set.
 */
function wouldBeShown(
  letting: LettingRead,
  goingLive: { onGaff: boolean; berRating: string | null } | null,
): boolean {
  const onGaff = goingLive?.onGaff ?? letting.onGaff;
  const berRating = goingLive?.berRating ?? letting.berRating;
  const lister = {
    kind: letting.listerKind,
    psraLicenceNumber: letting.psraLicenceNumber,
    confirmedAt: letting.confirmedAt,
    licenceLapsedAt: letting.licenceLapsedAt,
    identityVerifiedAt: letting.identityVerifiedAt,
    listingsPausedAt: letting.listingsPausedAt,
    name: letting.listerName,
  };
  return (
    (goingLive !== null || letting.status === 'live') &&
    letting.hiddenAt === null &&
    onGaff &&
    berRating !== null &&
    letting.photos > 0 &&
    listerMayShowHomes(lister)
  );
}

/** M29: the cross-lister counts, as the system. Codes and numbers come back; nothing else. */
async function countsFor(
  tx: Tx,
  letting: LettingRead,
  request: CheckRequest,
  words: string,
  now: Date,
) {
  const onlyThese =
    request.part === 'photos' && request.photoIds && request.photoIds.length > 0
      ? sql`and mine.id in (${sql.join(
          request.photoIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`
      : sql``;
  const detail = (column: string) =>
    sql.raw(
      `bit_count(${column}::bit(64)) between ${MIN_DETAIL_BITS} and ${64 - MIN_DETAIL_BITS}`,
    );
  const { rows: photos } = await tx.execute<{ n: number }>(sql`
    select count(distinct mine.id)::int as n
    from letting_photos mine
    join letting_photos theirs
      on theirs.organisation_id <> mine.organisation_id
      and theirs.phash is not null and ${detail('theirs.phash')}
      and bit_count((mine.phash # theirs.phash)::bit(64)) <= ${DUPLICATE_DISTANCE}
    where mine.letting_id = ${letting.id} and mine.phash is not null and ${detail('mine.phash')}
      ${onlyThese}`);

  // Similar homes on gaff.ie now: the same place and number of bedrooms, as the public query
  // shows them (live, on gaff.ie, a BER and a photo, not hidden).
  const place = placeOf(letting.area).toLowerCase();
  const { rows: similar } = await tx.execute<{ n: number; median: number | null }>(sql`
    select count(*)::int as n,
      percentile_cont(0.5) within group (order by l.monthly_rent_cents) as median
    from lettings l
    where l.id <> ${letting.id} and l.status = 'live' and l.on_gaff and l.hidden_at is null
      and l.ber_rating is not null and l.bedrooms = ${letting.bedrooms}
      and lower(trim(split_part(l.area, ',', 1))) = ${place}
      and exists (select 1 from letting_photos p where p.letting_id = l.id and p.kind = 'photo')`);

  const description = comparableDescription(letting.description);
  const { rows: copies } = description
    ? await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from lettings l
        where l.organisation_id <> ${letting.organisationId}
          and trim(regexp_replace(lower(coalesce(l.description, '')), '[^[:alnum:]]+', ' ', 'g'))
            = trim(regexp_replace(lower(${letting.description}), '[^[:alnum:]]+', ' ', 'g'))`)
    : { rows: [{ n: 0 }] };

  // This home and the others the account put on gaff.ie lately.
  const { rows: lately } = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from lettings l
    where l.organisation_id = ${letting.organisationId} and l.id <> ${letting.id}
      and l.on_gaff and l.live_at > ${new Date(now.getTime() - BURST_HOURS * 3_600_000)}`);

  // M98: what a person on Gaff's team has already released for this home.
  const released = await tx
    .select({ signals: listingCases.signals })
    .from(listingCases)
    .where(
      and(
        eq(listingCases.lettingId, letting.id),
        eq(listingCases.kind, 'hold'),
        eq(listingCases.decision, 'no_action'),
      ),
    );

  return {
    reusedPhotos: photos[0]!.n,
    rentCents: letting.monthlyRentCents,
    similar: {
      n: similar[0]!.n,
      medianRentCents: similar[0]!.median === null ? null : Number(similar[0]!.median),
    },
    copiedDescriptions: copies[0]!.n,
    account: { createdAt: letting.accountCreatedAt, homesShownLately: lately[0]!.n + 1 },
    description: words,
    released: [...new Set(released.flatMap((row) => row.signals ?? []))],
  };
}

/**
 * P12, P13: after the word list, the AI looks for unfair wording it can't catch. Only phrases
 * copied word for word from the text count, and only a phrase and a ground are kept. Null: the
 * check couldn't run (switched off, over budget, failed, or an answer that doesn't fit), and
 * the home goes ahead on the word list alone (P5).
 */
async function unfairWording(
  organisationId: string,
  text: string,
  names: readonly string[],
  ai?: AiProvider,
): Promise<WordingFinding[] | null> {
  if (!text.trim()) return [];
  // Rule 7: no names or contact details go to the model.
  const sent = stripPersonalDetails(text, names);
  const run = await runAi({
    task: 'wording',
    organisationId,
    ai: ai ?? aiProvider(),
    call: (provider) => provider.checkWording({ text: sent }),
  });
  if (run.outcome !== 'ok') return null;
  return checkWordingReading(run.output, text);
}

/**
 * M48: checks one home, and holds it for a person on Gaff's team if a signal says so. Returns
 * `skipped` for a home that isn't public (or about to be), or is already off gaff.ie.
 *
 * `goingLive` is the go-live step's own call, before the home goes live, with what that screen
 * is setting: so a home that is held is never public, not even for a moment. Any other change
 * comes here as the `check_listing` job, straight after it.
 */
export async function checkListing(
  request: CheckRequest,
  options: {
    goingLive?: { onGaff: boolean; berRating: string | null };
    ai?: AiProvider;
    now?: Date;
  } = {},
): Promise<CheckOutcome> {
  const now = options.now ?? new Date();
  const read = await withSystem(async (tx) => {
    const letting = await lettingFor(tx, request.lettingId);
    if (!letting || letting.organisationId !== request.organisationId) return null;
    if (!wouldBeShown(letting, options.goingLive ?? null)) return null;
    // A home never looked at in full while public is looked at in full now.
    const part: CheckPart = letting.screenedAt === null ? 'all' : request.part;
    const words = await publicWordsOf(tx, letting);
    const counts = await countsFor(tx, letting, { ...request, part }, words, now);
    return { letting, part, words, counts };
  });
  if (!read) return { outcome: 'skipped' };
  const { letting, part, words, counts } = read;

  const findings = looksAt('unfair_wording', part)
    ? await unfairWording(letting.organisationId, words, [letting.listerName], options.ai)
    : [];
  const raised = riskSignalsFrom(
    { ...counts, wordingFindings: findings === null ? null : findings.length },
    part,
    now,
  );
  const signals = signalsToHold(raised, part, counts.released);

  return withSystem(async (tx) => {
    const [fresh] = await tx
      .select({
        hiddenAt: lettings.hiddenAt,
        description: lettings.description,
        rent: lettings.monthlyRentCents,
      })
      .from(lettings)
      .where(eq(lettings.id, letting.id))
      .for('update');
    // Taken off, or changed again, while the checks ran: the next check has it.
    if (!fresh || fresh.hiddenAt) return { outcome: 'skipped' as const };
    if (fresh.description !== letting.description || fresh.rent !== letting.monthlyRentCents) {
      return { outcome: 'skipped' as const };
    }
    if (part === 'all') {
      await tx.update(lettings).set({ screenedAt: now }).where(eq(lettings.id, letting.id));
    }
    if (signals.length === 0) return { outcome: 'clear' as const };
    const caseId = await holdIn(tx, {
      organisationId: letting.organisationId,
      lettingId: letting.id,
      signals,
      findings: signals.includes('unfair_wording') ? (findings ?? []) : [],
      now,
    });
    return { outcome: 'held' as const, caseId, signals };
  });
}

/**
 * M29, M97: holds a listing for a person. A case of its own kind, due in working hours; the
 * home off gaff.ie (`hidden_after = 'check'`), so it has no page, isn't in search and its
 * enquiries wait; the event, with codes and counts only; and the lister's email, in fixed words.
 */
async function holdIn(
  tx: Tx,
  input: {
    organisationId: string;
    lettingId: string;
    signals: RiskSignal[];
    findings: WordingFinding[];
    now: Date;
  },
): Promise<string> {
  const dueBy = holdDueBy(input.signals, input.now);
  const [created] = await tx
    .insert(listingCases)
    .values({
      lettingId: input.lettingId,
      kind: 'hold',
      reasons: [],
      signals: input.signals,
      findings: input.findings.length > 0 ? input.findings : null,
      openedAt: input.now,
      dueBy,
      heldAt: input.now,
      deleteAfter: reportDeleteAfter(input.now),
    })
    .returning({ id: listingCases.id });
  const caseId = created!.id;
  await tx
    .update(lettings)
    .set({
      hiddenAt: input.now,
      hiddenReason: null,
      hiddenStage: 'held',
      hiddenAfter: 'check',
      lookAgainAskedAt: null,
    })
    .where(eq(lettings.id, input.lettingId));
  await recordEvent(tx, {
    organisationId: input.organisationId,
    lettingId: input.lettingId,
    actor: { type: 'system' },
    type: 'listing.held_by_checks',
    subject: { type: 'listing_case', id: caseId },
    data: {
      caseId,
      signals: input.signals,
      findings: input.findings.length,
      grounds: [...new Set(input.findings.map((finding) => finding.ground))],
    },
    occurredAt: input.now,
  });
  await enqueue(tx, 'send_account_email', {
    kind: 'listing_checking',
    organisationId: input.organisationId,
    lettingId: input.lettingId,
    caseId,
  });
  return caseId;
}

/**
 * M48: queues a check of a home after a change to what renters see of it, in the transaction
 * that made the change. The job looks only at a home that is public.
 */
export async function queueListingCheck(tx: Tx, request: CheckRequest): Promise<void> {
  await enqueue(tx, 'check_listing', {
    organisationId: request.organisationId,
    lettingId: request.lettingId,
    part: request.part,
    ...(request.photoIds ? { photoIds: [...request.photoIds] } : {}),
  });
}

/** P13: what the AI flagged on a home waiting for a person, for its lister. Phrases and grounds. */
export async function openHoldFor(
  organisationId: string,
  lettingId: string,
): Promise<{ dueBy: Date; findings: WordingFinding[] } | null> {
  const [open] = await withSystem((tx) =>
    tx
      .select({
        dueBy: listingCases.dueBy,
        findings: listingCases.findings,
        lettingOrganisationId: lettings.organisationId,
      })
      .from(listingCases)
      .innerJoin(lettings, eq(lettings.id, listingCases.lettingId))
      .where(
        and(
          eq(listingCases.lettingId, lettingId),
          eq(listingCases.kind, 'hold'),
          isNull(listingCases.decision),
        ),
      )
      .limit(1),
  );
  if (!open || open.lettingOrganisationId !== organisationId) return null;
  return { dueBy: open.dueBy, findings: open.findings ?? [] };
}
