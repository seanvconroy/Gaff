import { and, asc, count, eq, gt, min, ne } from 'drizzle-orm';
import { sourcesInWords } from '@/domain/enquiries/sources';
import { withOrg } from '@/db/client';
import {
  applications,
  bookings,
  lettings,
  messages,
  organisations,
  viewingSlots,
} from '@/db/schema';
import { both, decisionsCopy } from '@/copy/decisions';
import { goLiveCopy } from '@/copy/go-live';
import { stepNames } from '@/copy/tenancy-steps';
import { firstNameOf } from '@/domain/accounts/first-run';
import { formatRatio, incomeAgainstRule } from '@/domain/applications/apply';
import { allChecksBack, checkLine } from '@/domain/checks/review';
import { fitDetail } from '@/copy/fit';
import type { RenterAnswers } from '@/domain/criteria/answers';
import { conversationHref, conversationKey, inboxHref } from '@/domain/inbox/conversations';
import { hiddenHref, resumeHref, screenHref } from '@/domain/lettings/links';
import type { OverviewFacts } from '@/domain/lettings/overview';
import type { ApplicationStatus, PersonFacts } from '@/domain/lettings/people';
import { addAgencyHref } from '@/domain/navigation/account-menu';
import { finishHref, operatorStepHref, operatorSteps } from '@/domain/tenancy/operator-steps';
import { canFinish } from '@/domain/tenancy/steps';
import { formatEuro } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { applicantsFor } from '@/server/applications/choose';
import { checkResultsFor } from '@/server/checks/checks';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import { approvalFor } from '@/server/offers/approval';
import { offersFor } from '@/server/offers/offer';
import { rankLetting } from '@/server/shortlist/shortlist';
import { tenancyFor } from '@/server/tenancy/tenancy';
import { type TimelineEntry, timelineFor } from '@/server/timeline/timeline';
import { goLiveGateFor } from './go-live';
import type { LettingDetail } from './queries';

/**
 * A letting's page (section 4, "A letting's page"): everything its Overview is written from,
 * read once. The rules that turn these into the three blocks are in `@/domain/lettings/overview`.
 * Nothing here holds a renter's contact details or the words of a message: first names only,
 * and only where the page names someone (UX-HM-10).
 */
export async function overviewFactsFor(
  member: Member,
  detail: LettingDetail,
  now: Date = new Date(),
): Promise<{
  facts: OverviewFacts;
  recent: TimelineEntry[];
  /** UX-DC-16: while the owner is asked, "Remind Mary" sits with what Gaff is waiting on. */
  remindOwner: string | null;
}> {
  const { letting } = detail;
  const here = `/lettings/${letting.id}`;
  const board = await dashboardForRequest(member);
  const numbers = board.lettings.find((l) => l.id === letting.id);
  const today = board.everyone.filter(
    (item) => 'lettingId' in item && item.lettingId === letting.id,
  );
  const live = letting.status === 'live';
  const [counts, approval, listing, sent, tenancy, entries, gate] = await Promise.all([
    countsFor(member, letting.id, now),
    live ? approvalFor(member, letting.id) : null,
    live ? applicantsFor(member, letting.id) : null,
    offersFor(member, letting.id),
    tenancyFor(member, letting.id),
    timelineFor(member, letting.id),
    letting.status === 'draft' ? goLiveGateFor(member) : null,
  ]);

  // UX-DC-10, UX-DC-16: what Gaff waits on someone else for.
  const chosen = (listing?.rows ?? []).filter(
    (r) => r.status === 'preferred' || r.status === 'backup',
  );
  const preferred = chosen.find((r) => r.status === 'preferred');
  const backup = chosen.find((r) => r.status === 'backup');
  const open = sent.find((s) => s.offer.status === 'open');
  const owner =
    approval?.landlord && approval.route !== 'own_home'
      ? firstNameOf(approval.landlord.name)
      : null;
  const ownerAsked = approval?.approval?.status === 'requested' && owner ? owner : null;
  const waiting: string[] = [];
  if (open) {
    waiting.push(decisionsCopy.underWay.offerOut(firstNameOf(open.name), open.offer.expiresAt));
  } else {
    if (preferred && !allChecksBack(preferred.checks)) {
      waiting.push(
        decisionsCopy.underWay.checks(
          both(firstNameOf(preferred.name), backup ? firstNameOf(backup.name) : null),
        ),
      );
    }
    if (ownerAsked && approval?.approval) {
      waiting.push(
        decisionsCopy.owner.waiting.line(
          ownerAsked,
          approval.approval.remindedAt ?? approval.approval.requestedAt,
          now,
        ),
      );
    }
  }

  const answer = approval?.approval?.preferredAnswer;
  const ownerState: OverviewFacts['owner'] =
    approval?.route === 'own_home' || !approval
      ? null
      : answer === 'approved'
        ? 'approved'
        : answer === 'declined'
          ? 'declined'
          : approval.approval?.status === 'requested'
            ? 'waiting'
            : 'not_asked';
  const latest = sent.at(-1);
  const offer: OverviewFacts['offer'] = !latest
    ? { state: 'not_sent', firstName: null, until: null }
    : {
        state:
          latest.offer.status === 'open'
            ? 'open'
            : latest.offer.status === 'accepted'
              ? 'accepted'
              : 'not_accepted',
        firstName: firstNameOf(latest.name),
        until: latest.offer.expiresAt,
      };

  const steps = tenancy ? operatorSteps(tenancy.tenancy) : [];
  const next = steps.find((s) => s.state === 'next');
  const after = steps.find((s) => s.state !== 'done' && s !== next);
  const tenancyFacts: OverviewFacts['tenancy'] = tenancy
    ? {
        done: steps.filter((s) => s.state === 'done').length,
        total: steps.length,
        startDate: tenancy.tenancy.startDate,
        next: next
          ? { name: stepNames[next.key], href: operatorStepHref(letting.id, next.key) }
          : null,
        after: after ? stepNames[after.key] : null,
        waitingOn: steps.some((s) => s.state === 'waiting')
          ? firstNameOf(tenancy.tenant.fullName) || 'The tenant'
          : null,
        canFinish: canFinish(tenancy.tenancy),
        finishHref: finishHref(letting.id),
        finished: tenancy.tenancy.closedAt !== null,
      }
    : null;

  const blocked =
    gate && !letting.goLiveHeldAt && !gate.gate.open && !gate.gate.waits
      ? {
          words: goLiveCopy.held[gate.gate.reason](gate.organisationName),
          fix:
            gate.gate.reason === 'no_licence'
              ? { href: addAgencyHref, label: goLiveCopy.findLicence }
              : gate.gate.reason === 'identity_needed'
                ? { href: screenHref(letting.id, 'go_live'), label: goLiveCopy.confirmItsYou }
                : null,
        }
      : null;

  const facts: OverviewFacts = {
    lettingId: letting.id,
    stage: letting.stage,
    status: letting.status,
    goLiveHeld: letting.goLiveHeldAt !== null,
    goLiveHeldWords: gate ? goLiveCopy.waiting(gate.organisationName) : undefined,
    setupStepsLeft: numbers?.setupStepsLeft ?? 0,
    goLiveBlocked: blocked,
    resumeHref: resumeHref(letting.id, here),
    hidden: letting.hiddenAt
      ? {
          reason: letting.hiddenReason ?? 'something_else',
          stage: letting.hiddenStage ?? 'decided',
          href: hiddenHref(letting.id),
        }
      : null,
    rentOverCap: live && detail.rentProblem !== null,
    rentCheckHref: screenHref(letting.id, 'rent_check', here, { alone: '1' }),
    failedSends: {
      count: counts.failed.length,
      href:
        counts.failed.length === 1 && counts.failed[0]
          ? conversationHref(conversationKey({ kind: 'renter', id: counts.failed[0] }))
          : inboxHref(),
    },
    today,
    enquiries: numbers?.enquiries ?? 0,
    answered: counts.answered,
    meetEverything: counts.meetEverything,
    places: numbers?.places ?? 0,
    booked: numbers?.booked ?? 0,
    waitlisted: counts.waitlisted,
    nextViewing: counts.nextViewing,
    came: counts.came,
    applied: numbers?.applied ?? 0,
    checks: chosen.map((r) => ({
      firstName: firstNameOf(r.name),
      back: r.checks.filter((c) => c.status !== 'to_do' && c.status !== 'in_progress').length,
      total: r.checks.length,
    })),
    waitingOn: waiting.length > 0 ? waiting.join('\n') : null,
    owner: ownerState,
    offer,
    tenancy: tenancyFacts,
    results: { daysToLet: numbers?.daysToLet ?? null, minutesSaved: numbers?.minutesSaved ?? null },
    deleteOn: counts.deleteOn,
    deletesOthers: letting.stage === 'close' && tenancy !== null,
  };
  return {
    facts,
    recent: entries.slice(-3).reverse(),
    remindOwner: ownerAsked && !open ? ownerAsked : null,
  };
}

/** The counts the Overview needs that Today doesn't already hold. */
async function countsFor(member: Member, lettingId: string, now: Date) {
  return withOrg(member.organisationId, async (tx) => {
    const ranked = await rankLetting(tx, lettingId);
    const people = await tx
      .select({
        id: applications.id,
        status: applications.status,
        answersAt: applications.answersAt,
        deleteAfter: applications.deleteAfter,
        deletedAt: applications.personalDataDeletedAt,
      })
      .from(applications)
      .where(eq(applications.lettingId, lettingId));
    const byId = new Map(people.map((p) => [p.id, p]));
    const [next] = await tx
      .select({ at: min(viewingSlots.startsAt) })
      .from(viewingSlots)
      .where(and(eq(viewingSlots.lettingId, lettingId), gt(viewingSlots.startsAt, now)));
    const [came] = await tx
      .select({ n: count() })
      .from(bookings)
      .where(and(eq(bookings.lettingId, lettingId), eq(bookings.status, 'attended')));
    const failed = await tx
      .select({ applicationId: messages.applicationId })
      .from(messages)
      .where(
        and(
          eq(messages.lettingId, lettingId),
          eq(messages.status, 'failed'),
          eq(messages.direction, 'outbound'),
        ),
      );
    const deleteOn =
      people
        .filter((p) => p.deleteAfter && !p.deletedAt && p.status !== 'accepted')
        .map((p) => p.deleteAfter!)
        .sort()[0] ?? null;
    return {
      answered: people.filter((p) => p.answersAt !== null && p.status !== 'withdrawn').length,
      meetEverything: ranked.filter(
        (r) => byId.get(r.id)?.answersAt && r.answered && r.met === r.total,
      ).length,
      waitlisted: people.filter((p) => p.status === 'waitlisted').length,
      nextViewing: next?.at ?? null,
      came: came?.n ?? 0,
      failed: [...new Set(failed.map((f) => f.applicationId))].filter(
        (id): id is string => id !== null,
      ),
      deleteOn,
    };
  });
}

/** One person on People, with what their sheet shows (UX-LP-9). */
export interface PersonRow extends PersonFacts {
  /**
   * Their answers to the four questions, for "Ask about who's enquired" to filter on (UX-LP-15).
   * Null until they've answered, and once their details are deleted.
   */
  answers: RenterAnswers | null;
  /** UX-AV-8: where they came from, in words ("Gaff and Daft"). Empty once their details are deleted. */
  via: string;
  sheet: {
    /** How they fit what was asked, and why: the ranking's own reason (R10). */
    fit: string | null;
    /**
     * UX-MT-6: the detail behind "Meets 3 of 4": each criterion in the letting details' words,
     * with their answer and whether it meets it. Empty until they've answered.
     */
    fitRows: Array<{ label: string; value: string }>;
    told: Array<{ label: string; value: string }>;
    income: Array<{ label: string; value: string }>;
    checks: Array<{
      label: string;
      text: string;
      tone: 'success' | 'warning' | 'info' | 'neutral';
    }>;
    conversationHref: string;
  };
}

const earningWords: Record<string, string> = {
  employed: 'From a job',
  self_employed: 'Self-employed',
  other: 'Another way',
};

/**
 * UX-LP-8 to UX-LP-10: everyone who enquired, in the ranking's order (R10), then anyone who
 * withdrew. Each with what their stage has collected, and nothing more (rule 2): the answers to
 * the questions before viewing, income once they've applied, checks only for the two chosen.
 */
export async function peopleFor(member: Member, lettingId: string): Promise<PersonRow[]> {
  return withOrg(member.organisationId, async (tx) => {
    const ranked = await rankLetting(tx, lettingId);
    const people = await tx
      .select()
      .from(applications)
      .where(eq(applications.lettingId, lettingId))
      .orderBy(asc(applications.firstEnquiredAt));
    const [rule] = await tx
      .select({ tenths: organisations.incomeRuleTenths })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    const [letting] = await tx
      .select({ rentCents: lettings.monthlyRentCents, criteria: lettings.criteria })
      .from(lettings)
      .where(eq(lettings.id, lettingId));
    const booked = await tx
      .select({
        applicationId: bookings.applicationId,
        status: bookings.status,
        startsAt: viewingSlots.startsAt,
      })
      .from(bookings)
      .innerJoin(viewingSlots, eq(viewingSlots.id, bookings.slotId))
      .where(and(eq(bookings.lettingId, lettingId), ne(bookings.status, 'cancelled')));
    const bookingOf = new Map(booked.map((b) => [b.applicationId, b]));
    const chosenIds = people
      .filter((p) => ['preferred', 'backup', 'offered', 'accepted'].includes(p.status))
      .map((p) => p.id);
    const checks = await checkResultsFor(tx, chosenIds);
    const rentCents = letting?.rentCents ?? 0;
    const criteria = letting?.criteria ?? { noPets: false };
    const ruleTenths = rule?.tenths ?? 30;

    const rankOf = new Map(ranked.map((r) => [r.id, r]));
    const order = [
      ...ranked.map((r) => r.id),
      ...people.filter((p) => !rankOf.has(p.id)).map((p) => p.id),
    ];
    const byId = new Map(people.map((p) => [p.id, p]));
    return order.flatMap((id) => {
      const p = byId.get(id);
      if (!p) return [];
      const r = rankOf.get(id);
      const deleted = p.personalDataDeletedAt !== null;
      const booking = bookingOf.get(id);
      const income =
        p.monthlyIncomeCents !== null && p.appliedAt && !deleted
          ? incomeAgainstRule(p.monthlyIncomeCents, rentCents, ruleTenths)
          : null;
      const row: PersonRow = {
        id: p.id,
        name: deleted ? 'Details deleted' : p.fullName,
        status: p.status as ApplicationStatus,
        met: r?.met ?? 0,
        total: r?.total ?? 0,
        answered: r?.answered ?? p.answersAt !== null,
        enquiredAt: p.firstEnquiredAt,
        answeredAt: p.answersAt,
        booking: booking ? { startsAt: booking.startsAt, status: booking.status } : null,
        waitlistPosition: p.waitlistPosition,
        appliedAt: p.appliedAt,
        meetsIncomeRule: income ? income.meetsRule : null,
        deleted,
        answers: !deleted && p.answersAt ? p.answers : null,
        via: deleted ? '' : sourcesInWords(p.sources),
        sheet: {
          // When they enquired is under what's happened; this says only how they fit.
          fit: r && !deleted && p.answersAt ? r.reason.replace(/ Enquired .*$/, '') : null,
          fitRows: !deleted && p.answersAt ? fitDetail(criteria, p.answers) : [],
          told: deleted
            ? []
            : [
                ...(p.sources.length > 0
                  ? [
                      {
                        label: 'Enquired through',
                        value: sourcesInWords(p.sources),
                      },
                    ]
                  : []),
                { label: 'Email', value: p.email },
                ...(p.phone ? [{ label: 'Phone', value: p.phone }] : []),
              ],
          income:
            income && p.monthlyIncomeCents !== null
              ? [
                  ...(p.earning
                    ? [{ label: 'How they earn', value: earningWords[p.earning] ?? '' }]
                    : []),
                  {
                    label: 'Income',
                    value: `${formatEuro(p.monthlyIncomeCents)} a month, ${formatRatio(income.ratioTenths)} times the rent: ${income.meetsRule ? 'meets' : 'below'} your rule`,
                  },
                ]
              : [],
          checks: (checks.get(p.id) ?? []).map((c) => {
            const line = checkLine(c, { rentCents, ruleTenths });
            return { label: line.label, text: line.text, tone: line.tone };
          }),
          conversationHref: conversationHref(conversationKey({ kind: 'renter', id: p.id })),
        },
      };
      return [row];
    });
  });
}
