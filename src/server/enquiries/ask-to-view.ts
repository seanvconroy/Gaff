import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import { emailSender } from '@/adapters/email';
import { layOutEmail } from '@/copy/email-layout';
import { FIRST_REPLY_TEMPLATE } from '@/copy/templates/first-reply';
import { type Tx, withOrg, withSystem } from '@/db/client';
import {
  applications,
  lettings,
  messages,
  organisations,
  viewingSlots,
  waitingEnquiries,
} from '@/db/schema';
import { type RenterAnswers, renterAnswersSchema } from '@/domain/criteria/answers';
import { type Criteria, questionsFor } from '@/domain/criteria/criteria';
import {
  askContactSchema,
  askQuestionSchema,
  stillWaiting,
  waitEndsAt,
} from '@/domain/enquiries/ask-to-view';
import { normaliseEmail } from '@/domain/enquiries/parse';
import { listerMayShowHomes } from '@/domain/homes/home-page';
import { listerFrom } from '@/domain/frame/frame';
import { senderName } from '@/domain/messages/email';
import { env } from '@/lib/env';
import { adoptAccessLink, hashToken, newLinkToken } from '@/server/access/links';
import { attachEnquiry, ownEnquiries } from '@/server/accounts/enquiries';
import { keepEntered, noteConfirmed } from '@/server/accounts/renter-profile';
import { needsAnswers, queueDraft } from '@/server/answers/draft';
import { listerColumns } from '@/server/frame/lister';
import { resolvePublicHome } from '@/server/homes/public-homes';
import { enqueue } from '@/server/jobs/enqueue';
import { recordEvent } from '@/server/record/events';
import { queueFirstReply, writeFirstReply } from './first-reply';
import { newApplicationRef, placeEnquiry } from './place';

/**
 * UX-AV-1 to UX-AV-9: asking to view a home from its page on Gaff. An enquiry made here becomes
 * the same thing a forwarded Daft enquiry becomes: an application to the letting, with the same
 * first reply and the same private page (UX-AV-7), and with "Gaff" as its source (UX-AV-8). Here
 * it needs no forwarding and no reading: it is in the letting as soon as it is sent.
 *
 * Two ways it arrives:
 * - From someone signed in, with the address they sign in with (which is verified): straight in.
 * - From a typed email: it waits (`waiting_enquiries`) until that person opens the link in their
 *   first email, which proves the address is theirs (UX-AV-6). Until then the letting holds
 *   nothing of it. Its place in the order is the moment they pressed Send.
 *
 * Nothing here decides anything about anyone (rule 1), and nothing costs a renter anything
 * (rule 4): an enquiry is placed, answered with the fixed first reply, and a person decides.
 */

/** Who is asking, when they're signed in. Their own sign-in; never anyone else's. */
export interface AskingPerson {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

/** What a home's questions and the asking screens are built from. */
export interface AskHome {
  organisationId: string;
  lettingId: string;
  operatorName: string;
  criteria: Criteria;
  /** When viewings start, if any are set: the Sent screen says so. */
  firstViewing: Date | null;
}

/** The home behind a public reference, while it can be asked about. Null: it can't. */
export async function askableHome(ref: string): Promise<AskHome | null> {
  const found = await resolvePublicHome(ref);
  if (!found) return null;
  return withOrg(found.organisationId, async (tx) => {
    const [row] = await tx
      .select({ criteria: lettings.criteria, operatorName: organisations.name })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(eq(lettings.id, found.lettingId));
    if (!row) return null;
    const [firstSlot] = await tx
      .select({ startsAt: viewingSlots.startsAt })
      .from(viewingSlots)
      .where(eq(viewingSlots.lettingId, found.lettingId))
      .orderBy(asc(viewingSlots.startsAt))
      .limit(1);
    return {
      ...found,
      operatorName: row.operatorName,
      criteria: row.criteria ?? { noPets: false },
      firstViewing: firstSlot?.startsAt ?? null,
    };
  });
}

/**
 * UX-AV-9: "Ask to view" pressed again by someone signed in opens their existing enquiry. It is
 * theirs if it is in their Enquiries, or was made from the verified address they sign in with
 * (then it's added to their Enquiries now, UX-RH-4). Returns the application's ID, or null.
 */
export async function ownEnquiryAbout(
  person: AskingPerson,
  home: Pick<AskHome, 'organisationId' | 'lettingId'>,
): Promise<string | null> {
  const listed = (await ownEnquiries(person.userId)).find((e) => e.lettingId === home.lettingId);
  if (listed) return listed.applicationId;
  if (!person.emailVerified) return null;
  const [application] = await withOrg(home.organisationId, (tx) =>
    tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.lettingId, home.lettingId),
          eq(applications.emailNormalised, normaliseEmail(person.email)),
          isNull(applications.personalDataDeletedAt),
        ),
      ),
  );
  if (!application) return null;
  const added = await attachEnquiry(person.userId, {
    applicationId: application.id,
    organisationId: home.organisationId,
    lettingId: home.lettingId,
  });
  return added ? application.id : null;
}

export type AskResult =
  | { ok: true; applicationId: string; waiting: false }
  | { ok: true; waiting: true }
  | { ok: false; errors: Record<string, string> }
  | { ok: false; gone: true };

/**
 * "Send": checks what was entered against what this home asks (UX-AV-4), then places the
 * enquiry, or keeps it waiting for its link. `offered` says the answers were filled in from the
 * renter's own profile and they sent them on (UX-PF-3).
 */
export async function askToView(
  ref: string,
  values: Readonly<Record<string, string>>,
  person: AskingPerson | null,
  now: Date = new Date(),
): Promise<AskResult> {
  const home = await askableHome(ref);
  if (!home) return { ok: false, gone: true };

  const errors: Record<string, string> = {};
  const contact = askContactSchema.safeParse({
    fullName: person?.name.trim() ? person.name : values.fullName,
    email: person ? person.email : values.email,
  });
  for (const issue of contact.error?.issues ?? []) errors[String(issue.path[0])] ??= issue.message;
  const answers = renterAnswersSchema(home.criteria, now).safeParse(values);
  for (const issue of answers.error?.issues ?? []) errors[String(issue.path[0])] ??= issue.message;
  const question = askQuestionSchema.safeParse({
    question: values.skipQuestion ? '' : values.question,
  });
  for (const issue of question.error?.issues ?? []) errors.question ??= issue.message;
  if (!contact.success || !answers.success || !question.success) return { ok: false, errors };

  const entry = {
    fullName: contact.data.fullName,
    email: contact.data.email,
    answers: answers.data,
    question: question.data.question,
  };

  if (person?.emailVerified) {
    const applicationId = await withOrg(home.organisationId, async (tx) => {
      const letting = await askableLetting(tx, home.lettingId);
      if (!letting) return null;
      const placed = await enquiryInLetting(tx, {
        organisationId: home.organisationId,
        letting: letting.letting,
        ...entry,
        at: now,
        confirmed: 'signed_in',
      });
      return placed.applicationId;
    });
    if (!applicationId) return { ok: false, gone: true };
    // UX-RH-4, UX-PF-2: it is theirs, so it's in their Enquiries, and what they entered is kept
    // while keeping is on. Only the four answers: nothing else here is kept.
    await attachEnquiry(person.userId, { ...home, applicationId });
    if (values.offered === 'answers') await noteConfirmed(person.userId, applicationId, 'answers');
    if (Object.keys(entry.answers).length > 0) {
      await keepEntered(
        person.userId,
        { answers: { values: entry.answers, at: now } },
        { from: 'answers', applicationId },
        now,
      );
    }
    return { ok: true, applicationId, waiting: false };
  }

  const waited = await withOrg(home.organisationId, async (tx) => {
    const letting = await askableLetting(tx, home.lettingId);
    if (!letting) return false;
    await waitForLink(tx, { organisationId: home.organisationId, ...letting, ...entry, now });
    return true;
  });
  return waited ? { ok: true, waiting: true } : { ok: false, gone: true };
}

/** The letting and its lister, if it can still be asked about (live, on Gaff, lister may show). */
async function askableLetting(tx: Tx, lettingId: string) {
  const [row] = await tx
    .select({ letting: lettings, organisation: organisations })
    .from(lettings)
    .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
    .where(eq(lettings.id, lettingId))
    .for('update', { of: lettings });
  if (!row) return null;
  const { letting, organisation } = row;
  const open =
    letting.status === 'live' &&
    letting.onGaff &&
    letting.hiddenAt === null &&
    listerMayShowHomes({
      kind: organisation.kind,
      name: organisation.name,
      psraLicenceNumber: organisation.psraLicenceNumber,
      confirmedAt: organisation.confirmedAt,
      licenceLapsedAt: organisation.licenceLapsedAt,
      identityVerifiedAt: organisation.identityVerifiedAt,
    });
  return open ? row : null;
}

/**
 * UX-AV-6: keeps a typed-email enquiry waiting, and sends its first reply with the link that
 * confirms it. Someone who presses Send again before confirming keeps their first place and
 * the same 24 hours; the newest email's link is the one that works.
 */
async function waitForLink(
  tx: Tx,
  input: {
    organisationId: string;
    letting: typeof lettings.$inferSelect;
    organisation: typeof organisations.$inferSelect;
    fullName: string;
    email: string;
    answers: RenterAnswers;
    question: string | null;
    now: Date;
  },
): Promise<void> {
  const emailNormalised = normaliseEmail(input.email);
  const [before] = await tx
    .select()
    .from(waitingEnquiries)
    .where(
      and(
        eq(waitingEnquiries.lettingId, input.letting.id),
        eq(waitingEnquiries.emailNormalised, emailNormalised),
      ),
    )
    .for('update');
  const open = before && stillWaiting(before.expiresAt, input.now) ? before : null;
  if (before && !open) await tx.delete(waitingEnquiries).where(eq(waitingEnquiries.id, before.id));

  const { token, tokenHash } = newLinkToken();
  const reply = await writeFirstReply(tx, {
    letting: input.letting,
    organisation: input.organisation,
    renterName: input.fullName,
    token,
  });
  const sentAt = open?.sentAt ?? input.now;
  const values = {
    fullName: input.fullName,
    email: input.email,
    answers: input.answers,
    question: input.question,
    tokenHash,
    replySubject: reply.subject,
    replyBody: reply.body,
    replySentAt: null,
  };
  const [row] = open
    ? await tx
        .update(waitingEnquiries)
        .set(values)
        .where(eq(waitingEnquiries.id, open.id))
        .returning({ id: waitingEnquiries.id, expiresAt: waitingEnquiries.expiresAt })
    : await tx
        .insert(waitingEnquiries)
        .values({
          ...values,
          organisationId: input.organisationId,
          lettingId: input.letting.id,
          ref: newApplicationRef(),
          emailNormalised,
          sentAt,
          expiresAt: waitEndsAt(sentAt),
        })
        .returning({ id: waitingEnquiries.id, expiresAt: waitingEnquiries.expiresAt });
  await recordEvent(tx, {
    organisationId: input.organisationId,
    actor: { type: 'system' },
    type: 'enquiry.waiting',
    subject: { type: 'waiting_enquiry', id: row!.id },
    data: { waitingEnquiryId: row!.id, again: Boolean(open) },
  });
  const job = { organisationId: input.organisationId, waitingEnquiryId: row!.id };
  await enqueue(tx, 'send_waiting_reply', job, { jobKey: `waiting-reply:${row!.id}` });
  await enqueue(tx, 'drop_waiting_enquiry', job, {
    runAt: row!.expiresAt,
    jobKey: `waiting-drop:${row!.id}`,
  });
}

/**
 * UX-AV-7: sends a waiting enquiry's first reply: the fixed message, laid out and sent from the
 * lister as every first reply is, with replies threading to the application it will become.
 */
export async function sendWaitingReply(input: {
  organisationId: string;
  waitingEnquiryId: string;
}): Promise<'sent' | 'skipped'> {
  const claimed = await withOrg(input.organisationId, async (tx) => {
    const [row] = await tx
      .select({
        waiting: waitingEnquiries,
        operatorName: organisations.name,
        slug: organisations.inboundSlug,
        organisation: listerColumns,
      })
      .from(waitingEnquiries)
      .innerJoin(organisations, eq(organisations.id, waitingEnquiries.organisationId))
      .where(
        and(eq(waitingEnquiries.id, input.waitingEnquiryId), isNull(waitingEnquiries.replySentAt)),
      );
    return row ?? null;
  });
  if (!claimed) return 'skipped';
  const { waiting, operatorName, slug } = claimed;
  const config = env();
  const email = layOutEmail({
    kind: 'first_reply',
    author: 'template',
    subject: waiting.replySubject,
    body: waiting.replyBody,
    lister: listerFrom(claimed.organisation),
    appUrl: config.APP_URL,
  });
  await emailSender().send({
    to: waiting.email,
    from: {
      name: senderName({ kind: 'first_reply', operatorName, writer: null }),
      address: `${slug}@${config.MAIL_FROM_DOMAIN}`,
    },
    replyTo: `${slug}+${waiting.ref}@${config.INBOUND_DOMAIN}`,
    subject: waiting.replySubject,
    text: email.text,
    html: email.html,
    idempotencyKey: `waiting/${waiting.id}/${waiting.tokenHash.slice(0, 16)}`,
  });
  await withOrg(input.organisationId, (tx) =>
    tx
      .update(waitingEnquiries)
      .set({ replySentAt: new Date() })
      .where(
        and(eq(waitingEnquiries.id, waiting.id), eq(waitingEnquiries.tokenHash, waiting.tokenHash)),
      ),
  );
  return 'sent';
}

/** UX-AV-6 (rule 9): unconfirmed after 24 hours, a waiting enquiry is deleted. */
export async function dropWaitingEnquiry(
  input: { organisationId: string; waitingEnquiryId: string },
  now: Date = new Date(),
): Promise<boolean> {
  return withOrg(input.organisationId, async (tx) => {
    const [dropped] = await tx
      .delete(waitingEnquiries)
      .where(
        and(eq(waitingEnquiries.id, input.waitingEnquiryId), lte(waitingEnquiries.expiresAt, now)),
      )
      .returning({ id: waitingEnquiries.id });
    if (!dropped) return false;
    await recordDropped(tx, input.organisationId, dropped.id, 'unconfirmed');
    return true;
  });
}

/** The nightly backstop: every waiting enquiry past its 24 hours, across listers. A count. */
export async function dropExpiredWaitingEnquiries(now: Date = new Date()): Promise<number> {
  const due = await withSystem((tx) =>
    tx
      .select({ id: waitingEnquiries.id, organisationId: waitingEnquiries.organisationId })
      .from(waitingEnquiries)
      .where(lte(waitingEnquiries.expiresAt, now)),
  );
  let dropped = 0;
  for (const row of due) {
    if (
      await dropWaitingEnquiry(
        { organisationId: row.organisationId, waitingEnquiryId: row.id },
        now,
      )
    ) {
      dropped += 1;
    }
  }
  return dropped;
}

async function recordDropped(
  tx: Tx,
  organisationId: string,
  waitingEnquiryId: string,
  reason: 'unconfirmed' | 'not_available',
) {
  await recordEvent(tx, {
    organisationId,
    actor: { type: 'system' },
    type: 'enquiry.dropped',
    subject: { type: 'waiting_enquiry', id: waitingEnquiryId },
    data: { waitingEnquiryId, reason },
  });
}

/**
 * UX-AV-6: the link in a waiting enquiry's first email was opened. That proves the address is
 * theirs, so the enquiry goes into the letting now, and the link becomes their private page's.
 * Null if the token is no waiting enquiry's, or its 24 hours are up, or the home can no longer
 * be asked about. Safe to call twice: the second finds nothing waiting.
 */
export async function confirmWaitingEnquiry(
  token: string,
  now: Date = new Date(),
): Promise<{ organisationId: string; applicationId: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = hashToken(token);
  // The visitor has no account, so this one lookup runs across listers, as a private link's does.
  const [found] = await withSystem((tx) =>
    tx
      .select({ id: waitingEnquiries.id, organisationId: waitingEnquiries.organisationId })
      .from(waitingEnquiries)
      .where(eq(waitingEnquiries.tokenHash, tokenHash)),
  );
  if (!found) return null;
  return withOrg(found.organisationId, async (tx) => {
    const confirmed = await confirmWaitingIn(tx, found.organisationId, found.id, 'email_link', now);
    return confirmed ? { organisationId: found.organisationId, ...confirmed } : null;
  });
}

/**
 * The same, in a transaction the caller holds for this lister: also for a reply to the first
 * email, which proves the address just as well (`process.ts`).
 */
export async function confirmWaitingIn(
  tx: Tx,
  organisationId: string,
  waitingEnquiryId: string,
  how: 'email_link' | 'reply',
  now: Date = new Date(),
): Promise<{ applicationId: string; lettingId: string } | null> {
  const [waiting] = await tx
    .select()
    .from(waitingEnquiries)
    .where(eq(waitingEnquiries.id, waitingEnquiryId))
    .for('update');
  if (!waiting) return null;
  if (!stillWaiting(waiting.expiresAt, now)) {
    await tx.delete(waitingEnquiries).where(eq(waitingEnquiries.id, waiting.id));
    await recordDropped(tx, organisationId, waiting.id, 'unconfirmed');
    return null;
  }
  const letting = await askableLetting(tx, waiting.lettingId);
  if (!letting) {
    await tx.delete(waitingEnquiries).where(eq(waitingEnquiries.id, waiting.id));
    await recordDropped(tx, organisationId, waiting.id, 'not_available');
    return null;
  }
  const placed = await enquiryInLetting(tx, {
    organisationId,
    letting: letting.letting,
    fullName: waiting.fullName,
    email: waiting.email,
    answers: waiting.answers,
    question: waiting.question,
    at: waiting.sentAt,
    confirmed: how,
    waiting: {
      ref: waiting.ref,
      tokenHash: waiting.tokenHash,
      subject: waiting.replySubject,
      body: waiting.replyBody,
      sentAt: waiting.replySentAt ?? now,
    },
  });
  // Its details are the application's now: nothing is kept twice.
  await tx.delete(waitingEnquiries).where(eq(waitingEnquiries.id, waiting.id));
  await recordEvent(tx, {
    organisationId,
    lettingId: waiting.lettingId,
    actor: { type: 'renter', applicationId: placed.applicationId },
    type: 'enquiry.confirmed',
    subject: { type: 'application', id: placed.applicationId },
    data: { waitingEnquiryId: waiting.id, applicationId: placed.applicationId },
  });
  return { applicationId: placed.applicationId, lettingId: waiting.lettingId };
}

/** A waiting enquiry by the reference its first email's replies go to. */
export async function waitingByRef(tx: Tx, ref: string): Promise<string | null> {
  const [row] = await tx
    .select({ id: waitingEnquiries.id })
    .from(waitingEnquiries)
    .where(eq(waitingEnquiries.ref, ref));
  return row?.id ?? null;
}

/**
 * UX-AV-7 to UX-AV-9: an enquiry made on Gaff, in the letting. The one person's application
 * (merged with one from Daft or MyHome, R6), their answers, their question as an enquiry
 * message for the assistant, the first reply, and the record of it all, in one transaction.
 */
async function enquiryInLetting(
  tx: Tx,
  input: {
    organisationId: string;
    letting: typeof lettings.$inferSelect;
    fullName: string;
    email: string;
    answers: RenterAnswers;
    question: string | null;
    /** When Send was pressed: the enquiry's place in the order (UX-AV-6). */
    at: Date;
    confirmed: 'signed_in' | 'email_link' | 'reply';
    /** For an enquiry that waited: its reference, its link and the first reply already sent. */
    waiting?: { ref: string; tokenHash: string; subject: string; body: string; sentAt: Date };
  },
): Promise<{ applicationId: string; existing: boolean }> {
  const { organisationId, letting } = input;
  const placed = await placeEnquiry(tx, {
    organisationId,
    lettingId: letting.id,
    fullName: input.fullName,
    email: input.email,
    phone: null,
    source: 'gaff',
    at: input.at,
    ref: input.waiting?.ref,
  });
  const { applicationId, existing } = placed;

  // Their answers, as they sent them. An enquiry already in the letting takes them only while
  // answers can still change (R11: until a person decides who to invite).
  const asked = questionsFor(letting.criteria ?? { noPets: false }).length;
  const [application] = await tx
    .select({ status: applications.status, answersAt: applications.answersAt })
    .from(applications)
    .where(eq(applications.id, applicationId));
  if (asked > 0 && (!existing || application?.status === 'enquired')) {
    await tx
      .update(applications)
      .set({ answers: input.answers, answersAt: existing ? new Date() : input.at })
      .where(eq(applications.id, applicationId));
    await recordEvent(tx, {
      organisationId,
      lettingId: letting.id,
      actor: { type: 'renter', applicationId },
      type: 'application.answered',
      subject: { type: 'application', id: applicationId },
      data: {
        applicationId,
        questions: Object.keys(input.answers).length,
        changed: application?.answersAt != null,
      },
    });
  }

  if (input.waiting) {
    // The link in their first email is their private page's from now on (UX-PP-7).
    await adoptAccessLink(tx, {
      organisationId,
      purpose: 'renter',
      subjectId: applicationId,
      tokenHash: input.waiting.tokenHash,
    });
    const [reply] = await tx
      .insert(messages)
      .values({
        organisationId,
        lettingId: letting.id,
        applicationId,
        direction: 'outbound',
        channel: 'email',
        kind: 'first_reply',
        templateKey: FIRST_REPLY_TEMPLATE,
        author: 'template',
        toAddress: input.email,
        subject: input.waiting.subject,
        body: input.waiting.body,
        status: 'sent',
        sendAt: input.waiting.sentAt,
        sentAt: input.waiting.sentAt,
      })
      .returning({ id: messages.id });
    await recordEvent(tx, {
      organisationId,
      lettingId: letting.id,
      actor: { type: 'system' },
      type: 'message.sent',
      subject: { type: 'message', id: reply!.id },
      occurredAt: input.waiting.sentAt,
      data: {
        messageId: reply!.id,
        kind: 'first_reply',
        channel: 'email',
        author: 'template',
        applicationId,
        checkId: null,
      },
    });
  } else if (!existing) {
    // UX-AV-7: the same fixed first reply a Daft enquiry gets, with the link to the same page.
    await queueFirstReply(tx, organisationId, applicationId, { withLink: true });
  }

  await recordEvent(tx, {
    organisationId,
    lettingId: letting.id,
    actor: { type: 'renter', applicationId },
    type: existing ? 'enquiry.repeated' : 'enquiry.received',
    subject: { type: 'application', id: applicationId },
    data: { applicationId, portal: 'gaff', confirmed: input.confirmed },
  });

  // UX-AV-5: their question goes to the assistant like any enquiry's text: untrusted words,
  // stripped of names and contact details before any model sees them (rule 7).
  if (input.question) {
    const [message] = await tx
      .insert(messages)
      .values({
        organisationId,
        lettingId: letting.id,
        applicationId,
        direction: 'inbound',
        channel: 'email',
        kind: 'enquiry',
        author: 'renter',
        subject: null,
        body: input.question,
        status: 'received',
      })
      .returning({ id: messages.id });
    if (needsAnswers(input.question)) await queueDraft(tx, organisationId, message!.id);
  }
  return placed;
}
