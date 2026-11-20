import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like } from 'drizzle-orm';
import { type Tx, withSystem } from '@/db/client';
import {
  events,
  lettingPhotos,
  lettings,
  listingCases,
  listingReports,
  organisations,
} from '@/db/schema';
import { COVER_WIDTH } from '@/domain/lettings/photo-files';
import { photoSources } from '@/ports/photo-store';
import {
  homeHref,
  homeSummary,
  homeTitle,
  publicLister,
  type PublicLister,
} from '@/domain/homes/home-page';
import { likeliestReason, reportDeleteAfter, type ReportReason } from '@/domain/homes/report';
import {
  canDecideAppeal,
  caseDecisionSchema,
  type CaseDecision,
  type CaseFact,
  type CaseKind,
  type HiddenStage,
} from '@/domain/trust/cases';
import type { RiskSignal, WordingFinding } from '@/domain/listings/checks';
import type { Staff } from '@/server/auth/staff';
import { queueWaitingFirstReplies } from '@/server/enquiries/first-reply';
import { UserFacingError } from '@/server/errors';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';

/**
 * UX-TS-4, UX-TS-5, BA-9 (Q13, Q53; the live line's M97, M98, M106): what Gaff's own team does
 * about reported listings, from the internal page. Every function takes a `Staff`, which only
 * `requireStaff()` makes.
 *
 * Every report is part of a case about a listing, and a person decides every case: no action
 * (which puts back a listing the rules took off), or hiding it, with one of four fixed reasons
 * and the fixed facts it relies on. That statement of reasons goes to the lister, in fixed
 * words, and the lister can ask Gaff to look again once: a different person decides that
 * appeal. A visitor who asked to hear is told the outcome, in fixed words.
 *
 * Staff read the reports, the home's public facts (what its page on gaff.ie shows) and the
 * case's history from the letting's record of `listing.*` events, which hold only codes. That
 * is all. Nothing here reads a letting's people, applications, messages, viewings or
 * decisions, writes to any of them, or sends anyone a message of anyone's writing; the
 * enquiries that waited while a home was hidden get the same fixed first reply they would have
 * had, on the lister's own decision to put it live. BA-10: a listing the checks held as it went
 * public (`hold`) is decided here the same way: released, or kept off with reasons. Pausing a
 * lister's listings is its own step (src/server/trust/pauses.ts). A test holds this
 * (tests/integration/ux-ts-trust.test.ts, tests/compliance/staff-reach.test.ts).
 */

/** A report as staff read it: the answer tapped, the note, and when. Nobody's details. */
export interface ReportRead {
  id: string;
  reason: ReportReason;
  note: string | null;
  receivedAt: Date;
}

/** The home a case is about, as its public page shows it. */
interface ListingFacts {
  lettingId: string;
  ref: string;
  title: string;
  summary: string;
  lister: PublicLister;
  /** Its page on gaff.ie, while it has one. */
  href: string;
  /** The home's own description, as its page shows it: to look at. */
  description: string | null;
}

/** One step of a listing's history with Gaff's team, from its record. Codes and dates only. */
export interface CaseStep {
  at: Date;
  type:
    | 'listing.reported'
    | 'listing.held'
    | 'listing.hidden'
    | 'listing.kept_up'
    | 'listing.look_again_asked'
    | 'listing.appeal_decided'
    | 'listing.unhidden'
    | 'listing.held_by_checks'
    | 'listing.released';
  reason: ReportReason | null;
  /** Who: the system (the rules), a person on Gaff's team, or the lister. Never a name. */
  by: 'system' | 'staff' | 'lister';
}

/** An earlier decision, as an appeal shows it. */
export interface DecisionRead {
  decision: CaseDecision;
  reason: ReportReason | null;
  facts: CaseFact[];
  decidedAt: Date | null;
  /** Whether it was the person reading it who decided it. */
  byYou: boolean;
}

export interface OpenCase extends ListingFacts {
  id: string;
  kind: CaseKind;
  /** M97: decide by. */
  dueBy: Date;
  openedAt: Date;
  /** M97: when the rules took it off on strong signs of a scam, before a person looked. */
  heldAt: Date | null;
  /** BA-10 (M29): a hold's risk signals, as codes. Empty for any other kind. */
  signals: RiskSignal[];
  /** BA-10 (P13): what the AI's wording check found: the phrases, from its public page, and grounds. */
  findings: WordingFinding[];
  /** BA-10 (M29): the home's photos, as its page shows them (small), to look at. */
  photos: string[];
  /** The reports it holds (an appeal: those of the case it appeals), oldest first. */
  reports: ReportRead[];
  /** The reason offered first if it's hidden. */
  likeliest: ReportReason;
  /** An appeal: the decision it appeals. */
  appealOf: DecisionRead | null;
  /** M98: false where this person made the decision appealed: someone else must decide. */
  mayDecide: boolean;
  history: CaseStep[];
}

export interface HiddenListing extends ListingFacts {
  reason: ReportReason | null;
  stage: HiddenStage | null;
  hiddenAt: Date;
  history: CaseStep[];
  /** BA-10 (M107): the latest decision to keep it off, which a pause of its lister may follow. */
  decidedCaseId: string | null;
  /** BA-10 (M107): whether its lister's listings are paused now. */
  listerPaused: boolean;
}

const listingColumns = {
  lettingId: lettings.id,
  ref: lettings.publicRef,
  addressLine1: lettings.addressLine1,
  area: lettings.area,
  monthlyRentCents: lettings.monthlyRentCents,
  propertyType: lettings.propertyType,
  bedrooms: lettings.bedrooms,
  furnished: lettings.furnished,
  description: lettings.description,
  listerKind: organisations.kind,
  listerName: organisations.name,
  psraLicenceNumber: organisations.psraLicenceNumber,
  confirmedAt: organisations.confirmedAt,
  licenceLapsedAt: organisations.licenceLapsedAt,
  identityVerifiedAt: organisations.identityVerifiedAt,
};

type ListingRow = {
  lettingId: string;
  ref: string;
  addressLine1: string;
  area: string;
  monthlyRentCents: number;
  propertyType: string;
  bedrooms: number;
  furnished: string | null;
  description: string | null;
  listerKind: 'agency' | 'landlord' | 'private_landlord';
  listerName: string;
  psraLicenceNumber: string | null;
  confirmedAt: Date | null;
  licenceLapsedAt: Date | null;
  identityVerifiedAt: Date | null;
};

function factsOf(row: ListingRow): ListingFacts {
  return {
    lettingId: row.lettingId,
    ref: row.ref,
    title: homeTitle(row),
    summary: homeSummary(row),
    href: homeHref(row.ref),
    description: row.description,
    lister: publicLister({
      kind: row.listerKind,
      name: row.listerName,
      psraLicenceNumber: row.psraLicenceNumber,
      confirmedAt: row.confirmedAt,
      licenceLapsedAt: row.licenceLapsedAt,
      identityVerifiedAt: row.identityVerifiedAt,
    }),
  };
}

/** BA-10: the reason offered first for a held listing: wording alone is "unfair", else "scam". */
function holdReason(signals: readonly RiskSignal[]): ReportReason {
  return signals.every((signal) => signal === 'unfair_wording') ? 'unfair' : 'scam';
}

const historyTypes: readonly CaseStep['type'][] = [
  'listing.reported',
  'listing.held',
  'listing.hidden',
  'listing.kept_up',
  'listing.look_again_asked',
  'listing.appeal_decided',
  'listing.unhidden',
  'listing.held_by_checks',
  'listing.released',
];

/** The listings' histories with Gaff's team, from their records: `listing.*` events only. */
async function historiesOf(tx: Tx, lettingIds: string[]): Promise<Map<string, CaseStep[]>> {
  const out = new Map<string, CaseStep[]>();
  if (lettingIds.length === 0) return out;
  const rows = await tx
    .select({
      lettingId: events.lettingId,
      type: events.type,
      actorType: events.actorType,
      data: events.data,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(and(inArray(events.lettingId, lettingIds), like(events.type, 'listing.%')))
    .orderBy(asc(events.occurredAt), asc(events.id));
  for (const row of rows) {
    if (!row.lettingId || !historyTypes.includes(row.type as CaseStep['type'])) continue;
    const data = (row.data ?? {}) as { reason?: ReportReason };
    const steps = out.get(row.lettingId) ?? [];
    steps.push({
      at: row.occurredAt,
      type: row.type as CaseStep['type'],
      reason: data.reason ?? null,
      by: row.actorType === 'staff' ? 'staff' : row.actorType === 'person' ? 'lister' : 'system',
    });
    out.set(row.lettingId, steps);
  }
  return out;
}

/**
 * UX-TS-5, M106: the internal page's cases: those open, soonest due first, and the listings
 * hidden now, newest first. Across every lister, so as the system.
 */
export async function casesFor(
  staff: Staff,
): Promise<{ open: OpenCase[]; hidden: HiddenListing[] }> {
  return withSystem(async (tx) => {
    const openRows = await tx
      .select({
        id: listingCases.id,
        kind: listingCases.kind,
        dueBy: listingCases.dueBy,
        openedAt: listingCases.openedAt,
        heldAt: listingCases.heldAt,
        appealOf: listingCases.appealOf,
        signals: listingCases.signals,
        findings: listingCases.findings,
        listing: listingColumns,
      })
      .from(listingCases)
      .innerJoin(lettings, eq(lettings.id, listingCases.lettingId))
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(isNull(listingCases.decision))
      .orderBy(asc(listingCases.dueBy));

    const reportCaseIds = openRows.map((row) => row.appealOf ?? row.id);
    const reports =
      reportCaseIds.length === 0
        ? []
        : await tx
            .select({
              caseId: listingReports.caseId,
              id: listingReports.id,
              reason: listingReports.reason,
              note: listingReports.note,
              receivedAt: listingReports.receivedAt,
            })
            .from(listingReports)
            .where(inArray(listingReports.caseId, reportCaseIds))
            .orderBy(asc(listingReports.receivedAt));
    const appealed = openRows.flatMap((row) => (row.appealOf ? [row.appealOf] : []));
    const originals =
      appealed.length === 0
        ? []
        : await tx
            .select({
              id: listingCases.id,
              decision: listingCases.decision,
              reason: listingCases.decisionReason,
              facts: listingCases.decisionFacts,
              decidedAt: listingCases.decidedAt,
              decidedBy: listingCases.decidedBy,
            })
            .from(listingCases)
            .where(inArray(listingCases.id, appealed));

    const hiddenRows = await tx
      .select({
        listing: listingColumns,
        reason: lettings.hiddenReason,
        stage: lettings.hiddenStage,
        hiddenAt: lettings.hiddenAt,
        listerPausedAt: organisations.listingsPausedAt,
      })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(isNotNull(lettings.hiddenAt))
      .orderBy(desc(lettings.hiddenAt));

    const openIds = openRows.map((row) => row.listing.lettingId);
    const photoRows =
      openIds.length === 0
        ? []
        : await tx
            .select({
              lettingId: lettingPhotos.lettingId,
              storageKey: lettingPhotos.storageKey,
              widths: lettingPhotos.widths,
            })
            .from(lettingPhotos)
            .where(and(inArray(lettingPhotos.lettingId, openIds), eq(lettingPhotos.kind, 'photo')))
            .orderBy(asc(lettingPhotos.position));

    const histories = await historiesOf(tx, [
      ...new Set([
        ...openRows.map((row) => row.listing.lettingId),
        ...hiddenRows.map((row) => row.listing.lettingId),
      ]),
    ]);

    const open: OpenCase[] = openRows.map((row) => {
      const own = reports
        .filter((report) => report.caseId === (row.appealOf ?? row.id))
        .map(({ caseId: _caseId, ...report }) => report);
      const original = originals.find((each) => each.id === row.appealOf);
      return {
        ...factsOf(row.listing as ListingRow),
        id: row.id,
        kind: row.kind,
        dueBy: row.dueBy,
        openedAt: row.openedAt,
        heldAt: row.heldAt,
        signals: row.signals ?? [],
        findings: row.findings ?? [],
        photos: photoRows
          .filter((photo) => photo.lettingId === row.listing.lettingId)
          .map((photo) => photoSources(photo, COVER_WIDTH).src),
        reports: own,
        likeliest:
          original?.reason ??
          likeliestReason(own) ??
          (row.signals ? holdReason(row.signals) : 'something_else'),
        appealOf: original
          ? {
              decision: original.decision ?? 'hide_listing',
              reason: original.reason,
              facts: original.facts ?? [],
              decidedAt: original.decidedAt,
              byYou: original.decidedBy === staff.userId,
            }
          : null,
        mayDecide: canDecideAppeal(staff.userId, original?.decidedBy ?? null),
        history: histories.get(row.listing.lettingId) ?? [],
      };
    });
    const hiddenIds = hiddenRows.map((row) => row.listing.lettingId);
    const decided =
      hiddenIds.length === 0
        ? []
        : await tx
            .select({ id: listingCases.id, lettingId: listingCases.lettingId })
            .from(listingCases)
            .where(
              and(
                inArray(listingCases.lettingId, hiddenIds),
                eq(listingCases.decision, 'hide_listing'),
              ),
            )
            .orderBy(desc(listingCases.decidedAt));
    const hidden: HiddenListing[] = hiddenRows.map((row) => ({
      ...factsOf(row.listing as ListingRow),
      reason: row.reason,
      stage: row.stage,
      hiddenAt: row.hiddenAt!,
      history: histories.get(row.listing.lettingId) ?? [],
      decidedCaseId: decided.find((each) => each.lettingId === row.listing.lettingId)?.id ?? null,
      listerPaused: row.listerPausedAt !== null,
    }));
    return { open, hidden };
  });
}

/**
 * M98, M106: a person on Gaff's team decides a case. Recorded with actor `staff`, in the same
 * transaction as the change, with the lister's email and the reporters' outcome queued.
 *
 * - A report, no action: the listing stays up, or goes back up if the rules took it off.
 * - A report, hidden: it's off gaff.ie (or stays off), with the statement of reasons, and the
 *   lister may appeal.
 * - An appeal, decided by someone other than the person who decided the case it appeals: put
 *   back, or kept off with its own statement. Either way it's final.
 */
export async function decideCase(
  staff: Staff,
  input: unknown,
  now: Date = new Date(),
): Promise<{ decided: CaseDecision }> {
  const parsed = caseDecisionSchema.safeParse(input);
  if (!parsed.success) {
    throw new UserFacingError(
      parsed.error.issues[0]?.path[0] === 'facts'
        ? 'Choose what the decision relies on.'
        : 'Choose why it’s hidden.',
    );
  }
  const decision = parsed.data;
  return withSystem(async (tx) => {
    const [item] = await tx
      .select()
      .from(listingCases)
      .where(eq(listingCases.id, decision.caseId))
      .for('update');
    if (!item) throw new UserFacingError('We couldn’t find that case.');
    if (item.decision) throw new UserFacingError('Someone has already decided this case.');
    const [original] = item.appealOf
      ? await tx
          .select({ id: listingCases.id, decidedBy: listingCases.decidedBy })
          .from(listingCases)
          .where(eq(listingCases.id, item.appealOf))
      : [];
    if (item.kind === 'appeal' && !canDecideAppeal(staff.userId, original?.decidedBy ?? null)) {
      throw new UserFacingError(
        'Someone else on Gaff’s team must decide this: you made the first decision.',
      );
    }
    const [letting] = await tx
      .select({
        id: lettings.id,
        organisationId: lettings.organisationId,
        status: lettings.status,
        hiddenAt: lettings.hiddenAt,
        hiddenStage: lettings.hiddenStage,
        hiddenAfter: lettings.hiddenAfter,
      })
      .from(lettings)
      .where(eq(lettings.id, item.lettingId))
      .for('update');
    if (!letting) throw new UserFacingError('We couldn’t find that listing.');
    const base = {
      organisationId: letting.organisationId,
      lettingId: letting.id,
      actor: { type: 'staff' as const, userId: staff.userId },
      subject: { type: 'listing_case', id: item.id },
      occurredAt: now,
    };
    const deleteAfter = reportDeleteAfter(now);

    await tx
      .update(listingCases)
      .set({
        decision: decision.decision,
        decisionReason: decision.decision === 'hide_listing' ? decision.reason : null,
        decisionFacts: decision.decision === 'hide_listing' ? decision.facts : null,
        decidedAt: now,
        decidedBy: staff.userId,
        deleteAfter,
      })
      .where(eq(listingCases.id, item.id));
    // The case an appeal is about is kept as long as the appeal, so its history stays whole.
    if (original) {
      await tx.update(listingCases).set({ deleteAfter }).where(eq(listingCases.id, original.id));
    }

    const putBack = async () => {
      await tx
        .update(lettings)
        .set({
          hiddenAt: null,
          hiddenReason: null,
          hiddenStage: null,
          hiddenAfter: null,
          lookAgainAskedAt: null,
        })
        .where(eq(lettings.id, letting.id));
      // The lister's own decision to put it live stands: what waited goes now, as at go-live.
      const firstReplies =
        letting.status === 'live'
          ? await queueWaitingFirstReplies(tx, letting.organisationId, letting.id)
          : 0;
      await recordEvent(tx, {
        ...base,
        type: 'listing.unhidden',
        data: { caseId: item.id, firstReplies },
      });
      // BA-10: a home the checks held was never on gaff.ie: it's on now, not "back".
      await enqueue(tx, 'send_account_email', {
        kind: letting.hiddenAfter === 'check' ? 'listing_cleared' : 'listing_back',
        organisationId: letting.organisationId,
        lettingId: letting.id,
      });
    };

    if (item.kind === 'hold') {
      // BA-10 (M29, M98): a person looked at what the checks held, and released it or kept it off.
      if (decision.decision === 'no_action') {
        await recordEvent(tx, { ...base, type: 'listing.released', data: { caseId: item.id } });
        if (letting.hiddenAt) await putBack();
      } else {
        await tx
          .update(lettings)
          .set({
            hiddenAt: letting.hiddenAt ?? now,
            hiddenReason: decision.reason,
            hiddenStage: 'decided',
            hiddenAfter: 'check',
            lookAgainAskedAt: null,
          })
          .where(eq(lettings.id, letting.id));
        await recordEvent(tx, {
          ...base,
          type: 'listing.hidden',
          data: { caseId: item.id, reason: decision.reason, facts: decision.facts, reports: 0 },
        });
        await enqueue(tx, 'send_account_email', {
          kind: 'listing_not_shown',
          organisationId: letting.organisationId,
          lettingId: letting.id,
          caseId: item.id,
        });
      }
    } else if (item.kind === 'report') {
      const [counted] = await tx
        .select({ n: count() })
        .from(listingReports)
        .where(eq(listingReports.caseId, item.id));
      const reports = Number(counted?.n ?? 0);
      if (decision.decision === 'no_action') {
        await recordEvent(tx, {
          ...base,
          type: 'listing.kept_up',
          data: { caseId: item.id, reports },
        });
        if (letting.hiddenAt && letting.hiddenStage === 'held') await putBack();
      } else {
        await tx
          .update(lettings)
          .set({
            hiddenAt: letting.hiddenAt ?? now,
            hiddenReason: decision.reason,
            hiddenStage: 'decided',
            lookAgainAskedAt: null,
          })
          .where(eq(lettings.id, letting.id));
        await recordEvent(tx, {
          ...base,
          type: 'listing.hidden',
          data: { caseId: item.id, reason: decision.reason, facts: decision.facts, reports },
        });
        await enqueue(tx, 'send_account_email', {
          kind: 'listing_hidden',
          organisationId: letting.organisationId,
          lettingId: letting.id,
          caseId: item.id,
        });
      }
      const [asked] = await tx
        .select({ id: listingReports.id })
        .from(listingReports)
        .where(and(eq(listingReports.caseId, item.id), isNotNull(listingReports.outcomeEmail)))
        .limit(1);
      if (asked)
        await enqueue(tx, 'send_account_email', { kind: 'report_outcome', caseId: item.id });
    } else {
      await recordEvent(tx, {
        ...base,
        type: 'listing.appeal_decided',
        data:
          decision.decision === 'hide_listing'
            ? {
                caseId: item.id,
                decision: decision.decision,
                reason: decision.reason,
                facts: decision.facts,
              }
            : { caseId: item.id, decision: decision.decision },
      });
      if (decision.decision === 'no_action') {
        if (letting.hiddenAt) await putBack();
      } else {
        await tx
          .update(lettings)
          .set({
            hiddenAt: letting.hiddenAt ?? now,
            hiddenReason: decision.reason,
            hiddenStage: 'final',
          })
          .where(eq(lettings.id, letting.id));
        await enqueue(tx, 'send_account_email', {
          kind: 'listing_kept',
          organisationId: letting.organisationId,
          lettingId: letting.id,
          caseId: item.id,
        });
      }
    }
    return { decided: decision.decision };
  });
}
