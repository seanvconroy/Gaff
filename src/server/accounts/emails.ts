import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { emailSender, gaffSender } from '@/adapters/email';
import {
  type AccountEmail,
  agencyConfirmedEmail,
  agencyInviteEmail,
  colleagueInviteEmail,
  joinAnsweredEmail,
  licenceLapsedEmail,
  memberLeftEmail,
  licenceRenewedEmail,
  memberConflictEmail,
  profileUnusedEmail,
  signInChangedEmail,
  signInRefusedEmail,
} from '@/copy/account-emails';
import { layOutGaffEmail } from '@/copy/email-layout';
import { stillAvailableEmail } from '@/copy/freshness';
import { hiddenReasons } from '@/copy/trust';
import {
  appealKeptEmail,
  listingBackEmail,
  listingHeldEmail,
  listingHiddenEmail,
  reportOutcomeEmail,
} from '@/copy/trust-emails';
import { db, withOrg, withSystem } from '@/db/client';
import {
  lettings,
  listingCases,
  listingReports,
  memberships,
  organisationInvites,
  organisations,
  renterProfiles,
  users,
} from '@/db/schema';
import { env } from '@/lib/env';
import { shownName } from '@/domain/team/members';
import { stepsBackAt } from '@/domain/lettings/freshness';
import { stillAvailablePath } from '@/server/lettings/freshness';
import { formatDate, formatDateTime } from '@/lib/format';
import { invitePath } from '@/server/team/invite-links';
import { sendTrustEmail, type TrustEmailJob, trustEmailKinds } from '@/server/trust/emails';
import { INVITE_LASTS_DAYS } from './invites';

/**
 * Email from Gaff to the people who run an agency, about the agency's place on Gaff: that it's
 * confirmed (UX-AG-4), an invitation to its first admin (UX-AG-5), and word about its licence
 * (UX-AG-6). Each is queued in the transaction that made the change, and sent by the worker, so
 * an email goes if and only if the change happened, and is tried again if sending fails.
 *
 * The job's payload holds IDs and a count. The address is read here, when the email is sent.
 */
export const accountEmailJob = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agency_confirmed'),
    organisationId: z.uuid(),
    wentLive: z.number().int().min(0),
  }),
  z.object({ kind: z.literal('licence_lapsed'), organisationId: z.uuid() }),
  z.object({ kind: z.literal('licence_renewed'), organisationId: z.uuid() }),
  z.object({ kind: z.literal('agency_invite'), organisationId: z.uuid(), inviteId: z.uuid() }),
  /** UX-AG-11: an admin invited a colleague. */
  z.object({ kind: z.literal('colleague_invite'), organisationId: z.uuid(), inviteId: z.uuid() }),
  /** UX-AG-3: an admin answered someone's request to join. To that person. */
  z.object({
    kind: z.literal('join_answered'),
    organisationId: z.uuid(),
    userId: z.uuid(),
    approved: z.boolean(),
  }),
  /** UX-AG-17: a member left, and the admin who has their lettings now is told. */
  z.object({
    kind: z.literal('member_left'),
    organisationId: z.uuid(),
    memberUserId: z.uuid(),
    adminUserId: z.uuid(),
    handedOver: z.number().int().min(0),
  }),
  /** UX-AC-14: a member was stopped from working on a letting they applied for themselves. */
  z.object({
    kind: z.literal('member_conflict'),
    organisationId: z.uuid(),
    lettingId: z.uuid(),
    memberUserId: z.uuid(),
  }),
  /**
   * UX-TS-4, BA-9: a person on Gaff's team decided a case about one of the organisation's
   * homes: hidden, with the statement of reasons on the case; put back; or, on appeal, kept
   * off. Or the rules took it off for a person to check (`listing_held`).
   */
  z.object({
    kind: z.literal('listing_hidden'),
    organisationId: z.uuid(),
    lettingId: z.uuid(),
    caseId: z.uuid(),
  }),
  z.object({ kind: z.literal('listing_held'), organisationId: z.uuid(), lettingId: z.uuid() }),
  z.object({ kind: z.literal('listing_back'), organisationId: z.uuid(), lettingId: z.uuid() }),
  z.object({
    kind: z.literal('listing_kept'),
    organisationId: z.uuid(),
    lettingId: z.uuid(),
    caseId: z.uuid(),
  }),
  /**
   * BA-9 (M96): the outcome of a case, to each visitor who reported the listing and asked to
   * hear. Belongs to no organisation: the addresses are read from the case's reports, and
   * cleared once sent.
   */
  z.object({ kind: z.literal('report_outcome'), caseId: z.uuid() }),
  /**
   * M49 (BA-13): a live home had no change and no "Still available" for two weeks. To its
   * lead, with the signed link. `askedAt` is the ask the link answers.
   */
  z.object({
    kind: z.literal('still_available'),
    organisationId: z.uuid(),
    lettingId: z.uuid(),
    askedAt: z.iso.datetime(),
  }),
  /**
   * UX-PF-7: a renter's profile will be deleted for want of use. This one is to a person, about
   * their own profile, and belongs to no organisation.
   */
  z.object({ kind: z.literal('profile_unused'), userId: z.uuid(), deleteOn: z.iso.date() }),
  /**
   * BA-8 (AU11): a way in was added to or removed from a person's own account. To that person,
   * about their own sign-in. `at` is when it happened.
   */
  z.object({
    kind: z.literal('sign_in_changed'),
    userId: z.uuid(),
    change: z.enum(['added', 'removed']),
    method: z.enum(['google', 'apple', 'passkey']),
    at: z.iso.datetime(),
  }),
  /** BA-8 (AU4, AU11): someone tried to sign in with Google or Apple using their address. */
  z.object({
    kind: z.literal('sign_in_refused'),
    userId: z.uuid(),
    provider: z.enum(['google', 'apple']),
    at: z.iso.datetime(),
  }),
]);
export type AccountEmailJob = z.infer<typeof accountEmailJob> | TrustEmailJob;

async function send(to: string, email: AccountEmail, key: string): Promise<void> {
  const laidOut = layOutGaffEmail({
    subject: email.subject,
    body: email.text,
    button: email.button,
    appUrl: env().APP_URL,
  });
  await emailSender().send({
    to,
    from: gaffSender(),
    subject: email.subject,
    text: laidOut.text,
    html: laidOut.html,
    idempotencyKey: key,
  });
}

export async function sendAccountEmail(payload: unknown, attemptKey = ''): Promise<void> {
  const app = env().APP_URL.replace(/\/$/, '');
  // BA-10: a home the checks held, and a paused lister (src/server/trust/emails.ts).
  const kind = (payload as { kind?: unknown } | null)?.kind;
  if (trustEmailKinds.includes(kind as TrustEmailJob['kind'])) {
    await sendTrustEmail(payload, app, send);
    return;
  }
  const job = accountEmailJob.parse(payload);
  if (job.kind === 'sign_in_changed' || job.kind === 'sign_in_refused') {
    const [person] = await db()
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, job.userId));
    // The account has gone since: there's nobody to tell.
    if (!person) return;
    const when = formatDateTime(new Date(job.at));
    const profileUrl = `${app}/profile#profile-sign-in`;
    await send(
      person.email,
      job.kind === 'sign_in_changed'
        ? signInChangedEmail({ change: job.change, method: job.method, when, profileUrl })
        : signInRefusedEmail({ provider: job.provider, when, profileUrl }),
      `account-${job.kind}-${job.userId}-${job.kind === 'sign_in_changed' ? `${job.change}-${job.method}` : job.provider}-${job.at}`,
    );
    return;
  }
  if (job.kind === 'still_available') {
    await sendStillAvailable(job, app);
    return;
  }
  if (job.kind === 'report_outcome') {
    await sendReportOutcome(job.caseId, app);
    return;
  }
  if (job.kind === 'profile_unused') {
    // Used since the notice was queued, or already gone: there's nothing to say.
    const [stillDue] = await withSystem((tx) =>
      tx
        .select({ noticeSentAt: renterProfiles.deletionNoticeSentAt })
        .from(renterProfiles)
        .where(eq(renterProfiles.userId, job.userId)),
    );
    if (!stillDue?.noticeSentAt) return;
    const [person] = await db()
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, job.userId));
    if (!person) return;
    await send(
      person.email,
      profileUnusedEmail({
        // The year is always said: the date is weeks away, and may fall in the next one.
        deleteOn: formatDate(job.deleteOn, new Date(0)),
        profileUrl: `${app}/profile`,
      }),
      `account-profile_unused-${job.userId}-${job.deleteOn}`,
    );
    return;
  }
  const found = await withOrg(job.organisationId, async (tx) => {
    const [agency] = await tx
      .select({ name: organisations.name, licenceNumber: organisations.psraLicenceNumber })
      .from(organisations)
      .where(eq(organisations.id, job.organisationId));
    if (!agency) return null;
    const admins = await tx
      .select({ id: users.id, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organisationId, job.organisationId), eq(memberships.role, 'admin')),
      );
    const [invite] =
      job.kind === 'agency_invite' || job.kind === 'colleague_invite'
        ? await tx
            .select({
              id: organisationInvites.id,
              email: organisationInvites.email,
              sentAt: organisationInvites.sentAt,
              inviterName: users.name,
              inviterEmail: users.email,
            })
            .from(organisationInvites)
            .leftJoin(users, eq(users.id, organisationInvites.invitedBy))
            .where(eq(organisationInvites.id, job.inviteId))
        : [];
    // UX-AG-3, UX-AG-17: the one person this is to, and the person it's about.
    const [to] =
      job.kind === 'join_answered' || job.kind === 'member_left'
        ? await tx
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, job.kind === 'join_answered' ? job.userId : job.adminUserId))
        : [];
    const [about] =
      job.kind === 'member_left'
        ? await tx
            .select({ name: users.name, email: users.email })
            .from(users)
            .where(eq(users.id, job.memberUserId))
        : [];
    const [conflict] =
      job.kind === 'member_conflict'
        ? await tx
            .select({ address: lettings.addressLine1, memberName: users.name })
            .from(lettings)
            .innerJoin(users, eq(users.id, job.memberUserId))
            .where(eq(lettings.id, job.lettingId))
        : [];
    // UX-TS-4: the home, why it's hidden, and its lead, who is told with the admins.
    const [listing] =
      job.kind === 'listing_hidden' ||
      job.kind === 'listing_back' ||
      job.kind === 'listing_held' ||
      job.kind === 'listing_kept'
        ? await tx
            .select({
              address: lettings.addressLine1,
              reason: lettings.hiddenReason,
              hiddenAt: lettings.hiddenAt,
              stage: lettings.hiddenStage,
              leadId: users.id,
              leadEmail: users.email,
            })
            .from(lettings)
            .innerJoin(users, eq(users.id, lettings.leadUserId))
            .where(eq(lettings.id, job.lettingId))
        : [];
    return {
      agency,
      admins,
      listing: listing ?? null,
      invite: invite ?? null,
      conflict: conflict ?? null,
      to: to ?? null,
      about: about ?? null,
    };
  });
  if (!found) return;
  const { agency, admins, listing, invite, conflict, to, about } = found;
  const key = (to: string) => `account-${job.kind}-${job.organisationId}-${to}-${attemptKey}`;

  if (job.kind === 'agency_invite') {
    // Accepted or expired since it was queued: there's nobody to write to.
    if (!invite) return;
    await send(
      invite.email,
      agencyInviteEmail({
        agencyName: agency.name,
        joinUrl: `${app}${invitePath(invite)}`,
        days: INVITE_LASTS_DAYS,
      }),
      `account-agency_invite-${job.inviteId}-${invite.sentAt.getTime()}`,
    );
    return;
  }
  if (job.kind === 'colleague_invite') {
    // Accepted, cancelled or expired since it was queued: there's nobody to write to.
    if (!invite) return;
    await send(
      invite.email,
      colleagueInviteEmail({
        inviterName:
          invite.inviterName !== null && invite.inviterEmail !== null
            ? shownName({ name: invite.inviterName, email: invite.inviterEmail })
            : `Someone at ${agency.name}`,
        agencyName: agency.name,
        joinUrl: `${app}${invitePath(invite)}`,
        days: INVITE_LASTS_DAYS,
      }),
      // Sent again, it's a new email with a new link.
      `account-colleague_invite-${job.inviteId}-${invite.sentAt.getTime()}`,
    );
    return;
  }
  if (job.kind === 'join_answered') {
    if (!to) return;
    await send(
      to.email,
      joinAnsweredEmail({
        agencyName: agency.name,
        approved: job.approved,
        url: job.approved ? `${app}/today` : `${app}/`,
      }),
      `account-join_answered-${job.organisationId}-${job.userId}-${attemptKey}`,
    );
    return;
  }
  if (job.kind === 'member_left') {
    if (!to || !about) return;
    await send(
      to.email,
      memberLeftEmail({
        memberName: shownName(about),
        agencyName: agency.name,
        lettings: job.handedOver,
        lettingsUrl: `${app}/lettings`,
      }),
      `account-member_left-${job.organisationId}-${job.memberUserId}-${attemptKey}`,
    );
    return;
  }
  if (job.kind === 'member_conflict') {
    if (!conflict) return;
    const email = memberConflictEmail({
      memberName: conflict.memberName,
      address: conflict.address,
      lettingUrl: `${app}/lettings/${job.lettingId}`,
    });
    // The member is told on the page. An admin who is that member has nothing to pick up.
    for (const admin of admins.filter((each) => each.id !== job.memberUserId)) {
      await send(admin.email, email, `account-member_conflict-${job.lettingId}-${admin.id}`);
    }
    return;
  }
  if (
    job.kind === 'listing_hidden' ||
    job.kind === 'listing_back' ||
    job.kind === 'listing_held' ||
    job.kind === 'listing_kept'
  ) {
    if (!listing) return;
    // Put back, or moved on, since it was queued: this email would no longer be true.
    const stillTrue =
      job.kind === 'listing_back'
        ? listing.hiddenAt === null
        : job.kind === 'listing_held'
          ? listing.stage === 'held'
          : job.kind === 'listing_kept'
            ? listing.stage === 'final'
            : listing.hiddenAt !== null && listing.stage !== 'held';
    if (!stillTrue) return;
    const lettingUrl = `${app}/lettings/${job.lettingId}`;
    let email: AccountEmail;
    if (job.kind === 'listing_hidden' || job.kind === 'listing_kept') {
      // The statement of reasons is the case's, as the person decided it.
      const [decided] = await withSystem((tx) =>
        tx
          .select({
            reason: listingCases.decisionReason,
            facts: listingCases.decisionFacts,
            decidedAt: listingCases.decidedAt,
          })
          .from(listingCases)
          .where(eq(listingCases.id, job.caseId)),
      );
      if (!decided?.reason || !decided.facts || !decided.decidedAt) return;
      const statement = {
        address: listing.address,
        reason: decided.reason,
        reasonWords: hiddenReasons[decided.reason],
        facts: decided.facts,
        decidedOn: formatDate(decided.decidedAt),
        lettingUrl,
      };
      email =
        job.kind === 'listing_hidden' ? listingHiddenEmail(statement) : appealKeptEmail(statement);
    } else if (job.kind === 'listing_held') {
      email = listingHeldEmail({ address: listing.address, lettingUrl });
    } else {
      email = listingBackEmail({ address: listing.address, lettingUrl });
    }
    const told = new Map([[listing.leadId, listing.leadEmail]]);
    for (const admin of admins) told.set(admin.id, admin.email);
    const when =
      job.kind === 'listing_back'
        ? attemptKey
        : job.kind === 'listing_held'
          ? listing.hiddenAt!.getTime()
          : job.caseId;
    for (const [id, address] of told) {
      await send(address, email, `account-${job.kind}-${job.lettingId}-${id}-${when}`);
    }
    return;
  }
  const email =
    job.kind === 'agency_confirmed'
      ? agencyConfirmedEmail({
          agencyName: agency.name,
          wentLive: job.wentLive,
          todayUrl: `${app}/today`,
        })
      : job.kind === 'licence_lapsed'
        ? licenceLapsedEmail({
            agencyName: agency.name,
            licenceNumber: agency.licenceNumber ?? '',
            lettingsUrl: `${app}/lettings`,
          })
        : licenceRenewedEmail({ agencyName: agency.name, lettingsUrl: `${app}/lettings` });
  for (const admin of admins) await send(admin.email, email, key(admin.id));
}

/**
 * BA-9 (M96): the outcome of a case, to each visitor who asked to hear it, in fixed words. Each
 * address is cleared once its email is sent, so it is kept no longer than it's needed.
 */
async function sendReportOutcome(caseId: string, app: string): Promise<void> {
  const found = await withSystem(async (tx) => {
    const [decided] = await tx
      .select({ decision: listingCases.decision, address: lettings.addressLine1 })
      .from(listingCases)
      .innerJoin(lettings, eq(lettings.id, listingCases.lettingId))
      .where(eq(listingCases.id, caseId));
    if (!decided?.decision) return null;
    const asked = await tx
      .select({ id: listingReports.id, email: listingReports.outcomeEmail })
      .from(listingReports)
      .where(and(eq(listingReports.caseId, caseId), isNotNull(listingReports.outcomeEmail)));
    return { ...decided, asked };
  });
  if (!found) return;
  const email = reportOutcomeEmail({
    address: found.address,
    hidden: found.decision === 'hide_listing',
    searchUrl: `${app}/`,
  });
  const sent = new Set<string>();
  for (const report of found.asked) {
    const to = report.email!.toLowerCase();
    // One email to an address that reported the same listing twice.
    if (!sent.has(to)) {
      await send(report.email!, email, `report-outcome-${caseId}-${report.id}`);
      sent.add(to);
    }
    await withSystem((tx) =>
      tx.update(listingReports).set({ outcomeEmail: null }).where(eq(listingReports.id, report.id)),
    );
  }
}

/**
 * M49 (BA-13): "Is it still available?", to the home's lead, once for each ask. Answered,
 * changed or asked again since it was queued: this email would no longer be true.
 */
async function sendStillAvailable(
  job: Extract<AccountEmailJob, { kind: 'still_available' }>,
  app: string,
): Promise<void> {
  const askedAt = new Date(job.askedAt);
  const [found] = await withOrg(job.organisationId, (tx) =>
    tx
      .select({
        address: lettings.addressLine1,
        status: lettings.status,
        askedAt: lettings.freshnessAskedAt,
        confirmedAt: lettings.confirmedAvailableAt,
        leadEmail: users.email,
      })
      .from(lettings)
      .innerJoin(users, eq(users.id, lettings.leadUserId))
      .where(eq(lettings.id, job.lettingId)),
  );
  if (!found || found.status !== 'live' || found.askedAt?.getTime() !== askedAt.getTime()) return;
  if (found.confirmedAt && found.confirmedAt.getTime() >= askedAt.getTime()) return;
  await send(
    found.leadEmail,
    stillAvailableEmail({
      address: found.address,
      link: `${app}${stillAvailablePath(job.lettingId, askedAt)}`,
      stepsBackOn: formatDate(stepsBackAt(askedAt)),
      lettingUrl: `${app}/lettings/${job.lettingId}`,
    }),
    `account-still_available-${job.lettingId}-${job.askedAt}`,
  );
}
