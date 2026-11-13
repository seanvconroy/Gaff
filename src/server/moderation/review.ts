import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import {
  ACCOUNT_STATEMENT,
  accountActionEmail,
  appealOutcomeEmail,
  listingRemovedEmail,
  REMOVAL_STATEMENT,
} from '@/copy/listings';
import { reportOutcomeEmail } from '@/copy/reports';
import { scopeToOrg, withStaff, withSystem, type Tx } from '@/db/client';
import { listings, moderationActions, moderationCases, organisations, reports } from '@/db/schema';
import { listingTitle } from '@/domain/listings/projection';
import {
  canDecideAppeal,
  decisionGrounds,
  reviewDueBy,
  type CaseDecision,
  type DecisionReason,
} from '@/domain/moderation/reports';
import { env } from '@/lib/env';
import { formatDate, irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import type { Staff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { loadListing } from '@/server/listings/context';
import { moveListing } from '@/server/listings/publish';
import { recordPlatformEvent } from '@/server/record/platform-events';
import { emailLetter, emailPerson } from './notify';

/** Q36 (proposed): reports are kept 6 months after their case closes. */
const REPORT_KEEP_MONTHS = 6;

/**
 * M97, M106: the review queue: open cases from reports and appeals, soonest due first. Staff
 * read each listing inside its own organisation's scope, and only the listing.
 */
export async function openCases(staff: Staff) {
  return withStaff(staff.userId, async (tx) => {
    const cases = await tx
      .select({
        id: moderationCases.id,
        listingId: moderationCases.listingId,
        organisationId: moderationCases.subjectOrganisationId,
        organisationName: organisations.name,
        accountStatus: organisations.marketplaceStatus,
        source: moderationCases.source,
        reasons: moderationCases.reasons,
        dueBy: moderationCases.dueBy,
        openedAt: moderationCases.openedAt,
        appealOf: moderationCases.appealOf,
        appealText: moderationCases.appealText,
      })
      .from(moderationCases)
      .innerJoin(organisations, eq(organisations.id, moderationCases.subjectOrganisationId))
      .where(eq(moderationCases.status, 'open'))
      .orderBy(asc(moderationCases.dueBy));
    const out = [];
    for (const item of cases) {
      const caseReports = await tx
        .select({
          reason: reports.reason,
          details: reports.details,
          createdAt: reports.createdAt,
          withEmail: isNotNull(reports.reporterEmail),
        })
        .from(reports)
        .where(eq(reports.caseId, item.id))
        .orderBy(asc(reports.createdAt));
      const [original] = item.appealOf
        ? await tx
            .select({
              decision: moderationCases.decision,
              decisionReason: moderationCases.decisionReason,
              decidedBy: moderationCases.decidedBy,
            })
            .from(moderationCases)
            .where(eq(moderationCases.id, item.appealOf))
        : [];
      await scopeToOrg(tx, item.organisationId);
      const [row] = await tx
        .select({ lettingId: listings.lettingId })
        .from(listings)
        .where(eq(listings.id, item.listingId));
      const context = row ? await loadListing(tx, row.lettingId) : null;
      out.push({
        ...item,
        reports: caseReports,
        original: original ?? null,
        mayDecide: canDecideAppeal(staff.userId, original?.decidedBy ?? null),
        title: context ? listingTitle(context.home) : 'A listing',
        listingStatus: context?.listing.status ?? null,
        description: context?.listing.description ?? '',
        slug: context?.listing.slug ?? null,
      });
    }
    return out;
  });
}

export type OpenCase = Awaited<ReturnType<typeof openCases>>[number];

/** Pauses (or restores) every listing of an account, for an account action (M107). */
async function pauseAccountListings(tx: Tx, organisationId: string, now: Date) {
  const live = await tx
    .select({ lettingId: listings.lettingId })
    .from(listings)
    .where(and(eq(listings.organisationId, organisationId), eq(listings.status, 'live')));
  for (const { lettingId } of live) {
    const context = await loadListing(tx, lettingId);
    if (context) await moveListing(tx, context, 'paused', 'review', null, now);
  }
}

async function restoreReviewPaused(tx: Tx, organisationId: string, onlyListingId?: string) {
  const paused = await tx
    .select({ lettingId: listings.lettingId })
    .from(listings)
    .where(
      and(
        eq(listings.organisationId, organisationId),
        eq(listings.status, 'paused'),
        eq(listings.pauseReason, 'review'),
        onlyListingId ? eq(listings.id, onlyListingId) : undefined,
      ),
    );
  for (const { lettingId } of paused) {
    const context = await loadListing(tx, lettingId);
    if (context) await moveListing(tx, context, 'live', 'review', null);
  }
  return paused.length;
}

/**
 * M98, M106, M107: a person at Gaff decides a case. Every decision is recorded with who, what,
 * why and on what ground; a removal or restriction sends the letter a statement of reasons,
 * and reporters who gave an address hear the outcome.
 */
export async function decideCase(
  staff: Staff,
  caseId: string,
  decision: CaseDecision,
  reason: DecisionReason,
  now = new Date(),
): Promise<void> {
  const ground = decisionGrounds[reason];
  const result = await withStaff(staff.userId, async (tx) => {
    const [item] = await tx
      .select()
      .from(moderationCases)
      .where(and(eq(moderationCases.id, caseId), eq(moderationCases.status, 'open')))
      .for('update');
    if (!item) throw new UserFacingError('Someone has already decided this case.');
    if (item.appealOf) {
      const [original] = await tx
        .select({ decidedBy: moderationCases.decidedBy })
        .from(moderationCases)
        .where(eq(moderationCases.id, item.appealOf));
      if (!canDecideAppeal(staff.userId, original?.decidedBy ?? null)) {
        throw new UserFacingError('Someone else must decide this appeal: you made the decision.');
      }
    }
    await scopeToOrg(tx, item.subjectOrganisationId);
    const [row] = await tx
      .select({ lettingId: listings.lettingId })
      .from(listings)
      .where(eq(listings.id, item.listingId));
    const context = row ? await loadListing(tx, row.lettingId) : null;
    const [organisation] = await tx
      .select({ name: organisations.name, status: organisations.marketplaceStatus })
      .from(organisations)
      .where(eq(organisations.id, item.subjectOrganisationId));

    const actions: Array<typeof moderationActions.$inferInsert> = [];
    const base = {
      caseId,
      listingId: item.listingId,
      subjectOrganisationId: item.subjectOrganisationId,
      decidedBy: staff.userId,
    };
    if (item.appealOf) {
      // M98: an appeal either reverses the decision ("no_action") or keeps it.
      const [original] = await tx
        .select({ decision: moderationCases.decision })
        .from(moderationCases)
        .where(eq(moderationCases.id, item.appealOf));
      if (decision === 'no_action') {
        if (original?.decision === 'pause_account' || original?.decision === 'suspend_account') {
          await tx
            .update(organisations)
            .set({ marketplaceStatus: 'active' })
            .where(eq(organisations.id, item.subjectOrganisationId));
          await restoreReviewPaused(tx, item.subjectOrganisationId);
          actions.push({ ...base, action: 'restore_account', reason: 'appeal_upheld' });
        } else {
          actions.push({ ...base, action: 'no_action', reason: 'appeal_upheld' });
        }
      } else {
        actions.push({ ...base, action: 'no_action', reason: 'appeal_refused' });
      }
    } else if (decision === 'no_action') {
      // An automatic pause ends when a person finds nothing wrong.
      const restored = await restoreReviewPaused(tx, item.subjectOrganisationId, item.listingId);
      if (restored) actions.push({ ...base, action: 'restore_listing', reason: 'no_problem' });
      actions.push({ ...base, action: 'no_action', reason });
    } else if (decision === 'remove_listing') {
      if (context && context.listing.status !== 'withdrawn' && context.listing.status !== 'let') {
        await moveListing(tx, context, 'withdrawn', 'review', null, now);
      }
      actions.push({
        ...base,
        action: 'remove_listing',
        reason,
        ground: ground.ground,
        statementTemplate: REMOVAL_STATEMENT,
      });
    } else {
      const status = decision === 'pause_account' ? 'paused' : 'suspended';
      await tx
        .update(organisations)
        .set({ marketplaceStatus: status })
        .where(eq(organisations.id, item.subjectOrganisationId));
      await pauseAccountListings(tx, item.subjectOrganisationId, now);
      actions.push({
        ...base,
        action: decision,
        reason,
        ground: ground.ground,
        statementTemplate: ACCOUNT_STATEMENT,
      });
    }
    await tx.insert(moderationActions).values(actions);
    await tx
      .update(moderationCases)
      .set({
        status: 'closed',
        decision,
        decisionReason: reason,
        decidedBy: staff.userId,
        closedAt: now,
      })
      .where(eq(moderationCases.id, caseId));
    const keepUntil = new Date(now);
    keepUntil.setMonth(keepUntil.getMonth() + REPORT_KEEP_MONTHS);
    const reporters = await tx
      .update(reports)
      .set({ deleteAfter: irishToday(keepUntil) })
      .where(eq(reports.caseId, caseId))
      .returning({ email: reports.reporterEmail });
    for (const action of actions) {
      await recordPlatformEvent(tx, {
        type: 'moderation.action',
        actor: { type: 'staff', userId: staff.userId },
        subject: { type: 'moderation_case', id: caseId },
        data: { caseId, action: action.action!, automatic: false },
      });
    }
    return {
      appeal: item.appealOf !== null,
      organisationId: item.subjectOrganisationId,
      organisationName: organisation?.name ?? 'your account',
      agent: context?.listing.assignedTo ?? null,
      address: context?.home.addressLine1 ?? 'your listing',
      title: context ? listingTitle(context.home) : 'the listing',
      reporters: reporters.map((r) => r.email).filter((e): e is string => e !== null),
    };
  });

  const appealUrl = `${env().APP_URL}/listings/appeal/${caseId}`;
  if (result.appeal) {
    await emailLetter(
      result.organisationId,
      null,
      appealOutcomeEmail({ address: result.address, upheld: decision === 'no_action' }),
    );
  } else if (decision === 'remove_listing') {
    await emailLetter(
      result.organisationId,
      result.agent,
      listingRemovedEmail({
        address: result.address,
        reason,
        source: ground.source,
        decidedOn: formatDate(now),
        appealUrl,
      }),
    );
  } else if (decision === 'pause_account' || decision === 'suspend_account') {
    await emailLetter(
      result.organisationId,
      null,
      accountActionEmail({
        organisationName: result.organisationName,
        action: decision,
        reason,
        source: ground.source,
        decidedOn: formatDate(now),
        appealUrl,
      }),
    );
  }
  for (const email of result.appeal ? [] : new Set(result.reporters)) {
    await emailPerson(
      email,
      reportOutcomeEmail({ title: result.title, removed: decision !== 'no_action' }),
    );
  }
}

/** M107: accounts a person has paused or suspended, to restore when it's right. */
export async function restrictedAccounts(staff: Staff) {
  return withStaff(staff.userId, (tx) =>
    tx
      .select({
        id: organisations.id,
        name: organisations.name,
        status: organisations.marketplaceStatus,
      })
      .from(organisations)
      .where(inArray(organisations.marketplaceStatus, ['paused', 'suspended'])),
  );
}

/** M107: restore an account: its listings paused for review go live again. Recorded. */
export async function restoreAccount(staff: Staff, organisationId: string, now = new Date()) {
  await withStaff(staff.userId, async (tx) => {
    await scopeToOrg(tx, organisationId);
    await tx
      .update(organisations)
      .set({ marketplaceStatus: 'active' })
      .where(eq(organisations.id, organisationId));
    await restoreReviewPaused(tx, organisationId);
    await tx.insert(moderationActions).values({
      subjectOrganisationId: organisationId,
      action: 'restore_account',
      reason: 'restored',
      decidedBy: staff.userId,
      createdAt: now,
    });
    await recordPlatformEvent(tx, {
      type: 'moderation.action',
      actor: { type: 'staff', userId: staff.userId },
      data: { action: 'restore_account', automatic: false },
    });
  });
}

/**
 * M98: a letter appeals a decision about their listing or account. A different person at Gaff
 * decides it (canDecideAppeal), within a working day. Written into the staff zone as the system,
 * on the letter's behalf: only a decided case about their own organisation can be appealed, and
 * they never read the reports behind it.
 */
export async function appealDecision(
  member: Member,
  caseId: string,
  text: string,
  now = new Date(),
): Promise<'appealed' | 'not_found' | 'already'> {
  const appeal = text.trim().slice(0, 4000);
  if (appeal.length < 10) throw new UserFacingError('Tell us in a sentence or two why it’s wrong.');
  return withSystem(async (tx) => {
    const [decided] = await tx
      .select()
      .from(moderationCases)
      .where(
        and(
          eq(moderationCases.id, caseId),
          eq(moderationCases.subjectOrganisationId, member.organisationId),
          eq(moderationCases.status, 'closed'),
        ),
      );
    if (!decided || !decided.decision || decided.decision === 'no_action') return 'not_found';
    const [existing] = await tx
      .select({ id: moderationCases.id })
      .from(moderationCases)
      .where(eq(moderationCases.appealOf, caseId))
      .orderBy(desc(moderationCases.openedAt))
      .limit(1);
    if (existing) return 'already';
    const [created] = await tx
      .insert(moderationCases)
      .values({
        listingId: decided.listingId,
        subjectOrganisationId: decided.subjectOrganisationId,
        source: 'appeal',
        reasons: decided.reasons,
        dueBy: reviewDueBy(['appeal'], now),
        appealOf: caseId,
        appealText: appeal,
      })
      .returning({ id: moderationCases.id });
    await recordPlatformEvent(tx, {
      type: 'moderation.appealed',
      actor: { type: 'person', userId: member.userId },
      subject: { type: 'moderation_case', id: created!.id },
      data: { caseId: created!.id, appealOf: caseId },
    });
    return 'appealed';
  });
}

/** M98: what a letter may appeal: decided cases about their own listings. */
export async function appealableCase(member: Member, caseId: string) {
  return withSystem(async (tx) => {
    const [decided] = await tx
      .select({
        id: moderationCases.id,
        decision: moderationCases.decision,
        decisionReason: moderationCases.decisionReason,
        closedAt: moderationCases.closedAt,
        listingId: moderationCases.listingId,
      })
      .from(moderationCases)
      .where(
        and(
          eq(moderationCases.id, caseId),
          eq(moderationCases.subjectOrganisationId, member.organisationId),
          eq(moderationCases.status, 'closed'),
        ),
      );
    if (!decided || !decided.decision || decided.decision === 'no_action') return null;
    const [appealed] = await tx
      .select({ id: moderationCases.id, status: moderationCases.status })
      .from(moderationCases)
      .where(eq(moderationCases.appealOf, caseId))
      .limit(1);
    return { ...decided, appeal: appealed ?? null };
  });
}
