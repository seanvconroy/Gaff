import { and, asc, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import {
  applications,
  events,
  lettings,
  memberships,
  operatorQuestions,
  organisations,
} from '@/db/schema';
import {
  type Declines,
  isDeclinablePrompt,
  mostRepeatedQuestion,
  type PromptCode,
  promptCodes,
} from '@/domain/activation/prompts';
import {
  type SetupChecklist,
  type SetupFacts,
  setupChecklistFor,
  setupComplete,
} from '@/domain/dashboard/setup-checklist';
import { forwardingInPlace } from '@/domain/enquiries/forwarding';
import { hasTeam, may } from '@/domain/team/permissions';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

/**
 * Activation (section 9 of the UX redesign, work package WP-27): the setup checklist, and the
 * prompts' facts that only the record holds. Everything here is read from what has actually
 * happened, in the organisation's own data, inside `withOrg()`: the record's events, its homes,
 * its forwarding. What a person chose (a "Not now", "It's just me") is an event in the record
 * too, holding only codes (rule 8).
 */

/**
 * UX-GR-4: who joined a team that was already set up, by invite. The organisation's first member
 * set it up: nobody invited them, even when a founder made the agency for a pilot. Anyone after
 * them was invited, unless an admin said yes to their own request to join (UX-AG-3).
 */
async function joinedByInvite(tx: Tx, member: Member): Promise<boolean> {
  const [first] = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.organisationId, member.organisationId))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  if (!first || first.userId === member.userId) return false;
  const askedToJoin = await has(
    tx,
    and(
      eq(events.type, 'member.join_answered'),
      eq(events.subjectId, member.userId),
      sql`${events.data}->>'answer' = 'approved'`,
    ),
  );
  return !askedToJoin;
}

async function has(tx: Tx, where: SQL | undefined): Promise<boolean> {
  const [row] = await tx.select({ n: count() }).from(events).where(where);
  return (row?.n ?? 0) > 0;
}

/** The facts the checklist is worked out from, read from the organisation's own record. */
export async function setupFactsIn(tx: Tx, member: Member): Promise<SetupFacts> {
  const homes = await tx
    .select({
      id: lettings.id,
      status: lettings.status,
      goLiveHeldAt: lettings.goLiveHeldAt,
      advertisedOn: lettings.advertisedOn,
    })
    .from(lettings)
    .orderBy(desc(lettings.createdAt));
  const enquired = new Set(
    (await tx.selectDistinct({ lettingId: applications.lettingId }).from(applications)).map(
      (row) => row.lettingId,
    ),
  );
  const [organisation] = await tx
    .select({
      worksAt: organisations.forwardingWorksAt,
      testArrivedAt: organisations.forwardingTestArrivedAt,
    })
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  const wentLive = await has(tx, eq(events.type, 'letting.went_live'));
  const testSeen =
    organisation?.testArrivedAt != null ||
    (await has(tx, eq(events.type, 'letting.test_enquiry_sent')));
  const finishedBefore = await has(
    tx,
    and(eq(events.type, 'setup.finished'), eq(events.actorId, member.userId)),
  );
  const teamAnswered =
    hasTeam(member.organisationKind) &&
    (await has(tx, inArray(events.type, ['member.invited', 'team.just_me'])));
  // A member who joined later counts as a team grown too: nobody needs inviting first.
  const [{ n: members } = { n: 1 }] = await tx
    .select({ n: count() })
    .from(memberships)
    .where(eq(memberships.organisationId, member.organisationId));
  const testable = homes.find((home) => home.status === 'live' && !enquired.has(home.id));
  return {
    organisationKind: member.organisationKind,
    role: member.role,
    joinedByInvite: await joinedByInvite(tx, member),
    finishedBefore,
    lettingLiveOrHeld: wentLive || homes.some((home) => home.goLiveHeldAt !== null),
    testableLettingId: testable?.id ?? null,
    testSeen,
    realEnquiry: enquired.size > 0,
    draftLettingId:
      homes.find((home) => home.status === 'draft' && home.goLiveHeldAt === null)?.id ?? null,
    advertisedOn: homes.flatMap((home) => home.advertisedOn ?? []),
    forwardingInPlace: forwardingInPlace({ worksAt: organisation?.worksAt ?? null }),
    teamAnswered: teamAnswered || members > 1,
  };
}

/** Whether anyone on the team has sent an invite: "Invite your team" then isn't asked again. */
async function inviteSentIn(tx: Tx): Promise<boolean> {
  return has(tx, eq(events.type, 'member.invited'));
}

export interface Setup {
  checklist: SetupChecklist | null;
  /** The checklist was completed just now: Today says "You're all set" this once. */
  justFinished: boolean;
  /**
   * An invite was sent: "Invite your team" as a prompt is then done with. "It's just me" isn't
   * this: it answers the checklist's step, and puts the prompt off like "Not now" (UX-AG-13).
   */
  inviteSent: boolean;
}

/**
 * UX-GR-1: the person's checklist on Today. The first time it is found complete, that is kept
 * in the record, so it never shows again, and Today says "You're all set" once.
 */
export async function setupFor(member: Member): Promise<Setup> {
  return withOrg(member.organisationId, async (tx) => {
    const facts = await setupFactsIn(tx, member);
    const checklist = setupChecklistFor(facts);
    let justFinished = false;
    if (!checklist && !facts.finishedBefore && setupComplete(facts)) {
      // Taken under a lock, so two tabs opening Today at once record it once.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`setup-finished:${member.organisationId}:${member.userId}`}))`,
      );
      const again = await has(
        tx,
        and(eq(events.type, 'setup.finished'), eq(events.actorId, member.userId)),
      );
      if (!again) {
        await recordEvent(tx, {
          organisationId: member.organisationId,
          actor: { type: 'person', userId: member.userId },
          type: 'setup.finished',
          // How many steps the person's checklist had: its first step undone shows them all.
          data: {
            steps: setupChecklistFor({ ...facts, lettingLiveOrHeld: false })?.total ?? 1,
          },
        });
        justFinished = true;
      }
    }
    return { checklist, justFinished, inviteSent: await inviteSentIn(tx) };
  });
}

/**
 * UX-GR-1: "It's just me", from "Invite your team". An admin's answer. It ticks the checklist's
 * step, and puts the prompt for a sole admin off as "Not now" does: it can come back in
 * fourteen days, once there is a live letting (UX-AG-13).
 */
export async function chooseJustMe(member: Member): Promise<void> {
  if (!hasTeam(member.organisationKind) || !may('manage_team', { role: member.role })) {
    throw new UserFacingError('Only an admin can answer this for the team.');
  }
  await withOrg(member.organisationId, async (tx) => {
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'team.just_me',
      data: {},
    });
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'prompt.declined',
      data: { prompt: 'invite_team' },
    });
  });
}

/** UX-GR-5: "Not now". The prompt waits fourteen days, or for good if it is shown once. */
export async function declinePrompt(member: Member, prompt: unknown): Promise<void> {
  if (!isDeclinablePrompt(prompt)) throw new UserFacingError('That can’t be put off.');
  await withOrg(member.organisationId, (tx) =>
    recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'prompt.declined',
      data: { prompt },
    }),
  );
}

/** When this person last declined each prompt, here. */
export async function declinesIn(tx: Tx, member: Member): Promise<Declines> {
  const rows = await tx
    .select({
      prompt: sql<string>`${events.data}->>'prompt'`,
      at: sql<Date>`max(${events.occurredAt})`,
    })
    .from(events)
    .where(and(eq(events.type, 'prompt.declined'), eq(events.actorId, member.userId)))
    .groupBy(sql`${events.data}->>'prompt'`);
  const declines: Declines = {};
  for (const row of rows) {
    if ((promptCodes as readonly string[]).includes(row.prompt)) {
      declines[row.prompt as PromptCode] = new Date(row.at);
    }
  }
  return declines;
}

/** What Today's prompts read beyond the dashboard: declines, checking, answers. */
export interface TodayPromptFacts {
  declines: Declines;
  approveBeforeSend: boolean;
  recentApprovals: { edited: boolean }[];
}

export async function todayPromptFactsFor(member: Member): Promise<TodayPromptFacts> {
  return withOrg(member.organisationId, async (tx) => {
    const [organisation] = await tx
      .select({ approveBeforeSend: organisations.approveBeforeSend })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    // The latest twenty drafts a person dealt with: sent as they were, edited, or discarded.
    const recent = await tx
      .select({ type: events.type, edited: sql<boolean>`(${events.data}->>'edited')::boolean` })
      .from(events)
      .where(inArray(events.type, ['message.approved', 'message.discarded']))
      .orderBy(desc(events.occurredAt), desc(events.id))
      .limit(20);
    return {
      declines: await declinesIn(tx, member),
      approveBeforeSend: organisation?.approveBeforeSend ?? true,
      recentApprovals: recent.map((row) => ({
        edited: row.type === 'message.discarded' || row.edited === true,
      })),
    };
  });
}

/**
 * "Gaff can answer more if you add…": the open question asked most often about one of the
 * member's homes, and how many times. The words are compared, never shown or followed.
 */
export async function inboxPromptFactsFor(member: Member): Promise<{
  declines: Declines;
  repeatedQuestion: { lettingId: string; times: number } | null;
}> {
  return withOrg(member.organisationId, async (tx) => {
    const open = await tx
      .select({ lettingId: operatorQuestions.lettingId, question: operatorQuestions.question })
      .from(operatorQuestions)
      .innerJoin(lettings, eq(lettings.id, operatorQuestions.lettingId))
      .where(and(eq(operatorQuestions.status, 'open'), eq(lettings.leadUserId, member.userId)));
    return { declines: await declinesIn(tx, member), repeatedQuestion: mostRepeatedQuestion(open) };
  });
}

/**
 * UX-GR-3: just after a first letting goes live, whether its test enquiry is still to see. The
 * go-live path leads there, the checklist's own next step, so the person watches Gaff answer
 * before any real enquiry arrives.
 */
export async function testEnquiryDue(member: Member, lettingId: string): Promise<boolean> {
  return withOrg(member.organisationId, async (tx) => {
    const facts = await setupFactsIn(tx, member);
    const next = setupChecklistFor(facts)?.next;
    return next?.code === 'see_test' && next.lettingId === lettingId;
  });
}

/** When this person last declined each prompt, in their organisation. */
export async function declinesFor(member: Member): Promise<Declines> {
  return withOrg(member.organisationId, (tx) => declinesIn(tx, member));
}
