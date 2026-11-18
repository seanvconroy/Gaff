import { and, desc, eq, isNull } from 'drizzle-orm';
import { type Tx, withOrg } from '@/db/client';
import { inboundEmails, lettingDrafts, lettingFacts, lettingPhotos, lettings } from '@/db/schema';
import {
  type CoreStep,
  type DraftAnswers,
  type DraftOrigin,
  type FlowStep,
  draftAnswersSchema,
  furthestStep,
  hasCore,
  stepAfter,
  withAnswers,
} from '@/domain/lettings/add-letting';
import {
  type DraftReading,
  draftReadingSchema,
  fieldsChanged,
  readingAfterSave,
} from '@/domain/lettings/advert-reading';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { processInboundEmailIn } from '@/server/enquiries/process';
import { UserFacingError } from '@/server/errors';
import { recordFunnelStep } from '@/server/funnels/steps';
import { recordEvent } from '@/server/record/events';
import { makeLettingIn } from './create-letting';
import { type HomePhoto, type LettingDetail, lettingDetailIn, photosIn } from './queries';
import { assertMayActOn } from '@/server/team/permissions';

/**
 * Adding a letting, a step at a time (UX-FL-2, UX-LT-5). A home being added is a DRAFT until it
 * has an address, a rent, a date, a type and a bedroom count; then it is a LETTING in set-up,
 * with the same ID. The steps read and write "the home" and need not know which it is.
 *
 * A home that arrives filled in (let again, read from an advert, started from an enquiry) is a
 * draft with `review: true`: the person lands on the review screen, changes what's wrong, and
 * after "Looks right" sees only the steps that still need an answer. One that was read carries
 * its `reading` (advert-reading.ts): where each value came from, for the review to show.
 */

type DraftRow = typeof lettingDrafts.$inferSelect;

interface HomeBase {
  id: string;
  answers: DraftAnswers;
  /** How far the person has got. `review`: it arrived filled in and hasn't been confirmed. */
  reached: FlowStep | 'review' | null;
  photos: HomePhoto[];
  /** UX-AI-4: where each value came from, for a draft that was read. Null for any other home. */
  reading: DraftReading | null;
}

export type FlowHome =
  | (HomeBase & {
      kind: 'draft';
      origin: DraftOrigin;
      previousLettingId: string | null;
      detail: null;
    })
  | (HomeBase & { kind: 'letting'; origin: 'manual'; detail: LettingDetail });

const known = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

/** A letting's facts in the shape the steps read, so Back works after it has become a letting. */
function answersOfLetting(detail: LettingDetail): DraftAnswers {
  const { letting, facts } = detail;
  const parsed = draftAnswersSchema.safeParse(
    Object.fromEntries(
      Object.entries({
        addressLine1: letting.addressLine1,
        addressLine2: known(letting.addressLine2),
        area: letting.area,
        county: letting.county,
        eircode: known(letting.eircode),
        rentCents: letting.monthlyRentCents,
        availableFrom: letting.availableFrom,
        propertyType: letting.propertyType,
        bedrooms: letting.bedrooms,
        bathrooms: known(letting.bathrooms),
        furnished: known(letting.furnished),
        berRating: known(letting.berRating),
        parking: known(letting.parking),
        description: known(letting.description),
        otherFacts: facts.filter((fact) => fact.source === 'setup').map((fact) => fact.answer),
        daftUrl: known(letting.daftUrl),
        myhomeUrl: known(letting.myhomeUrl),
        criteria: known(letting.criteria),
        noSmokingIndoors: letting.noSmokingIndoors || undefined,
      }).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)),
    ),
  );
  if (!parsed.success) throw new Error('A letting holds a value the flow can’t read');
  return parsed.data;
}

async function homeIn(tx: Tx, id: string): Promise<FlowHome | null> {
  const [draft] = await tx.select().from(lettingDrafts).where(eq(lettingDrafts.id, id));
  if (draft) {
    return {
      kind: 'draft',
      id,
      origin: draft.origin,
      answers: draftAnswersSchema.parse(draft.answers),
      reached: draft.step,
      previousLettingId: draft.previousLettingId,
      photos: await photosIn(tx, { draftId: id }),
      reading: draft.reading ? draftReadingSchema.parse(draft.reading) : null,
      detail: null,
    };
  }
  const detail = await lettingDetailIn(tx, id);
  if (!detail) return null;
  return {
    kind: 'letting',
    id,
    origin: 'manual',
    answers: answersOfLetting(detail),
    reached: detail.letting.setupStep,
    photos: detail.photos,
    reading: null,
    detail,
  };
}

/** The home being added, draft or letting, or null if it isn't this organisation's. */
export async function loadHome(member: Member, id: string): Promise<FlowHome | null> {
  return withOrg(member.organisationId, (tx) => homeIn(tx, id));
}

/** Drafts this organisation has started and not finished, newest first: "Pick up where you left off". */
export async function listDrafts(member: Member) {
  const rows = await withOrg(member.organisationId, (tx) =>
    tx
      .select({
        id: lettingDrafts.id,
        answers: lettingDrafts.answers,
        updatedAt: lettingDrafts.updatedAt,
      })
      .from(lettingDrafts)
      .orderBy(desc(lettingDrafts.updatedAt)),
  );
  return rows.map((row) => ({
    id: row.id,
    addressLine1: row.answers.addressLine1 ?? null,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Begins a draft. `answers` is what's already known about the home, if anything; `review`
 * sends the person to the review screen first (UX-LT-4), for a draft that arrives filled in.
 */
export async function startDraftIn(
  tx: Tx,
  member: Member,
  input: {
    origin: DraftOrigin;
    answers?: DraftAnswers;
    review?: boolean;
    previousLettingId?: string;
    /** For a home that was read: where each value came from (UX-AI-4). */
    reading?: DraftReading;
    /** UX-LT-16: the enquiry the home is started from. */
    inboundEmailId?: string;
  },
): Promise<{ id: string }> {
  const [draft] = await tx
    .insert(lettingDrafts)
    .values({
      organisationId: member.organisationId,
      createdBy: member.userId,
      origin: input.origin,
      answers: draftAnswersSchema.parse(input.answers ?? {}),
      step: input.review ? 'review' : null,
      previousLettingId: input.previousLettingId ?? null,
      reading: input.reading ? draftReadingSchema.parse(input.reading) : null,
      inboundEmailId: input.inboundEmailId ?? null,
    })
    .returning({ id: lettingDrafts.id });
  const id = draft!.id;
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId: id,
    actor: { type: 'person', userId: member.userId },
    type: 'letting.draft_started',
    subject: { type: 'letting', id },
    data: {
      origin: input.origin,
      ...(input.previousLettingId ? { fromLettingId: input.previousLettingId } : {}),
      ...(input.inboundEmailId ? { inboundEmailId: input.inboundEmailId } : {}),
    },
  });
  return { id };
}

export async function startDraft(
  member: Member,
  input: Parameters<typeof startDraftIn>[2],
): Promise<{ id: string }> {
  return withOrg(member.organisationId, (tx) => startDraftIn(tx, member, input));
}

/**
 * UX-LT-8 (Q31): keeps a Daft or MyHome link pasted on the first screen, to match enquiries to
 * this home. The page is never fetched. Begins the draft if there isn't one yet.
 */
export async function keepAdvertLinks(
  member: Member,
  draftId: string | null,
  links: { daftUrl?: string; myhomeUrl?: string },
): Promise<{ id: string }> {
  return withOrg(member.organisationId, async (tx) => {
    const id = draftId ?? (await startDraftIn(tx, member, { origin: 'manual' })).id;
    const [draft] = await tx
      .select()
      .from(lettingDrafts)
      .where(eq(lettingDrafts.id, id))
      .for('update');
    if (!draft) throw new UserFacingError('We couldn’t find that home. Start again.');
    // Only the two links: whatever else the caller's object holds is not an answer.
    const given = {
      ...(links.daftUrl ? { daftUrl: links.daftUrl } : {}),
      ...(links.myhomeUrl ? { myhomeUrl: links.myhomeUrl } : {}),
    };
    await tx
      .update(lettingDrafts)
      .set({ answers: withAnswers(draftAnswersSchema.parse(draft.answers), given) })
      .where(eq(lettingDrafts.id, id));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: id,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.advert_link_kept',
      data: { daft: Boolean(links.daftUrl), myhome: Boolean(links.myhomeUrl) },
    });
    return { id };
  });
}

/** The draft becomes a letting, with the same ID, the moment it has what a letting needs. */
async function becomeLettingIn(
  tx: Tx,
  member: Member,
  draft: DraftRow,
  answers: DraftAnswers,
  reached: FlowStep,
): Promise<void> {
  if (!hasCore(answers)) throw new Error('A draft became a letting before it had what one needs');
  // UX-LT-23: let again for the same owner, where an agency lets it for one.
  const [previous] = draft.previousLettingId
    ? await tx
        .select({ landlordId: lettings.landlordId })
        .from(lettings)
        .where(eq(lettings.id, draft.previousLettingId))
    : [];
  await makeLettingIn(tx, member, {
    ...answers,
    id: draft.id,
    landlordId: previous?.landlordId ?? null,
    setupStep: reached,
    origin: draft.origin,
    previousLettingId: draft.previousLettingId,
  });
  await tx
    .update(lettingPhotos)
    .set({ lettingId: draft.id, draftId: null })
    .where(eq(lettingPhotos.draftId, draft.id));
  await tx.delete(lettingDrafts).where(eq(lettingDrafts.id, draft.id));
  if (draft.inboundEmailId) await attachEnquiryIn(tx, member, draft.id, draft.inboundEmailId);
}

/**
 * UX-LT-16: the enquiry a home was started from becomes that renter's enquiry about it, now
 * that there is a letting to hold it. They get their first reply when the home goes live, like
 * anyone who enquires during set-up (R7). If the email was dealt with meanwhile (matched to
 * another home, or set aside), nothing happens; if it can no longer be read, it stays in Inbox.
 */
async function attachEnquiryIn(
  tx: Tx,
  member: Member,
  lettingId: string,
  inboundEmailId: string,
): Promise<void> {
  const taken = await tx
    .update(inboundEmails)
    .set({ status: 'received' })
    .where(and(eq(inboundEmails.id, inboundEmailId), eq(inboundEmails.status, 'needs_attention')))
    .returning({ id: inboundEmails.id });
  if (taken.length === 0) return;
  const outcome = await processInboundEmailIn(tx, {
    organisationId: member.organisationId,
    inboundEmailId,
    forcedLettingId: lettingId,
  });
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId,
    actor: { type: 'person', userId: member.userId },
    type: 'letting.enquiry_attached',
    subject: { type: 'inbound_email', id: inboundEmailId },
    data: { inboundEmailId, matched: outcome.kind !== 'needs_attention' },
  });
}

/** A letting's own columns for a step's answers. The rent is changed with its own event. */
async function changeLettingIn(
  tx: Tx,
  member: Member,
  detail: LettingDetail,
  step: CoreStep | 'description',
  answers: DraftAnswers,
): Promise<void> {
  const { letting } = detail;
  if (!hasCore(answers)) {
    throw new UserFacingError('A letting needs its address, rent, date, type and bedrooms.');
  }
  const actor = { type: 'person', userId: member.userId } as const;
  await tx
    .update(lettings)
    .set({
      addressLine1: answers.addressLine1,
      addressLine2: answers.addressLine2 ?? null,
      area: answers.area,
      county: answers.county,
      eircode: answers.eircode ?? null,
      monthlyRentCents: answers.rentCents,
      availableFrom: answers.availableFrom,
      propertyType: answers.propertyType,
      bedrooms: answers.bedrooms,
      bathrooms: answers.bathrooms ?? null,
      furnished: answers.furnished ?? null,
      berRating: answers.berRating ?? null,
      parking: answers.parking ?? null,
      description: answers.description ?? null,
    })
    .where(eq(lettings.id, letting.id));

  // The facts written at set-up are replaced only when they changed: a fact renters have
  // been answered from keeps its ID.
  const before = detail.facts.filter((fact) => fact.source === 'setup');
  const after = answers.otherFacts ?? [];
  if (before.map((fact) => fact.answer).join('\n') !== after.join('\n')) {
    await tx
      .update(lettingFacts)
      .set({ retiredAt: new Date() })
      .where(
        and(
          eq(lettingFacts.lettingId, letting.id),
          eq(lettingFacts.source, 'setup'),
          isNull(lettingFacts.retiredAt),
        ),
      );
    if (after.length > 0) {
      await tx.insert(lettingFacts).values(
        after.map((answer, index) => ({
          organisationId: member.organisationId,
          lettingId: letting.id,
          answer,
          source: 'setup' as const,
          createdBy: member.userId,
          createdAt: new Date(Date.now() + index),
        })),
      );
    }
  }
  if (answers.rentCents !== letting.monthlyRentCents) {
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: letting.id,
      actor,
      type: 'letting.rent_changed',
      data: { fromCents: letting.monthlyRentCents, toCents: answers.rentCents },
    });
  }
  await recordEvent(tx, {
    organisationId: member.organisationId,
    lettingId: letting.id,
    actor,
    type: 'letting.details_changed',
    data: { step: step === 'description' ? 'home' : step },
  });
}

const SETUP_ONLY = 'This home is live now. Change its details from its own page.';

/**
 * Saves one step's answers (or one of the review's sheets) to the home. `advance` moves the
 * person on: it returns the step that comes next, and remembers it as where to come back to.
 * A sheet on the review screen saves without moving anyone (`advance: false`).
 */
export async function saveAnswers(
  member: Member,
  id: string,
  input: {
    /** `details` is the review's letting-details sheet: a draft's only. */
    step: CoreStep | 'description' | 'details';
    patch: Partial<{ [K in keyof DraftAnswers]: DraftAnswers[K] | undefined }>;
    advance: boolean;
  },
): Promise<{ kind: 'draft' | 'letting'; next: FlowStep }> {
  return withOrg(member.organisationId, async (tx) => {
    const [draft] = await tx
      .select()
      .from(lettingDrafts)
      .where(eq(lettingDrafts.id, id))
      .for('update');
    const actor = { type: 'person', userId: member.userId } as const;
    const from = input.step === 'description' || input.step === 'details' ? 'home' : input.step;

    if (draft) {
      const before = draftAnswersSchema.parse(draft.answers);
      const answers = withAnswers(before, input.patch);
      // UX-AI-4: a value the person changed is theirs now, and no longer "from your advert".
      const reading = draft.reading
        ? readingAfterSave(draftReadingSchema.parse(draft.reading), input.step, before, answers)
        : null;
      const photos = (await photosIn(tx, { draftId: id })).length;
      const next = stepAfter(from, { answers, photos }, draft.origin);
      await recordEvent(tx, {
        organisationId: member.organisationId,
        lettingId: id,
        actor,
        type: 'letting.draft_saved',
        data: { step: input.advance ? from : 'review' },
      });
      // A draft still at its review stays a draft until "Looks right" (UX-LT-4).
      if (hasCore(answers) && draft.step !== 'review') {
        await becomeLettingIn(tx, member, draft, answers, next);
        return { kind: 'letting', next };
      }
      await tx
        .update(lettingDrafts)
        .set({
          answers,
          reading,
          step:
            draft.step === 'review' || !input.advance ? draft.step : furthestStep(draft.step, next),
        })
        .where(eq(lettingDrafts.id, id));
      return { kind: 'draft', next };
    }

    const detail = await lettingDetailIn(tx, id);
    if (!detail) throw new UserFacingError('We couldn’t find that home.');
    await assertMayActOn(tx, member, id);
    // UX-LP-12: a live home's facts and description can change at any time, and Gaff answers
    // from them as they are from then on. The address and rent are set up once.
    const live = detail.letting.status === 'live';
    const factsOnly = input.step === 'home' || input.step === 'description';
    if (detail.letting.stage !== 'setup' && !(live && factsOnly && !input.advance)) {
      throw new UserFacingError(SETUP_ONLY);
    }
    if (input.step === 'details')
      throw new Error('A letting’s details are set with setLettingDetails');
    const home = await homeIn(tx, id);
    const answers = withAnswers(home!.answers, input.patch);
    await changeLettingIn(tx, member, detail, input.step, answers);
    const next = stepAfter(from, { answers, photos: detail.photos.length }, 'manual');
    if (input.advance) await reachIn(tx, id, next);
    return { kind: 'letting', next };
  });
}

async function reachIn(tx: Tx, lettingId: string, step: FlowStep): Promise<void> {
  const [letting] = await tx
    .select({ setupStep: lettings.setupStep, stage: lettings.stage })
    .from(lettings)
    .where(eq(lettings.id, lettingId));
  if (!letting || letting.stage !== 'setup') return;
  const furthest = furthestStep(letting.setupStep, step);
  if (furthest !== letting.setupStep) {
    await tx.update(lettings).set({ setupStep: furthest }).where(eq(lettings.id, lettingId));
  }
}

/**
 * UX-FL-2: the person has moved on to this step of a letting in set-up (after photos, letting
 * details or the rent check), so that is where they come back to. It only ever moves forward.
 */
export async function reachStep(member: Member, lettingId: string, step: FlowStep): Promise<void> {
  await withOrg(member.organisationId, (tx) => reachIn(tx, lettingId, step));
}

/**
 * UX-LT-4, UX-LT-5: "Looks right" on the review screen. From here the person sees only the
 * steps that still need an answer; if nothing a letting needs is missing, it becomes one now.
 */
export async function confirmReview(
  member: Member,
  id: string,
): Promise<{ kind: 'draft' | 'letting'; next: FlowStep }> {
  return withOrg(member.organisationId, async (tx) => {
    const [draft] = await tx
      .select()
      .from(lettingDrafts)
      .where(eq(lettingDrafts.id, id))
      .for('update');
    if (!draft) {
      // Pressed twice, or opened again after it became a letting: carry on from there.
      const home = await homeIn(tx, id);
      if (!home) throw new UserFacingError('We couldn’t find that home.');
      const photos = home.photos.length;
      return {
        kind: 'letting',
        next: stepAfter('home', { answers: home.answers, photos }, 'again'),
      };
    }
    const held = draftAnswersSchema.parse(draft.answers);
    // UX-LT-3: a date that has passed (an old advert's) isn't carried on: it is asked for.
    const answers =
      held.availableFrom && held.availableFrom < irishToday()
        ? withAnswers(held, { availableFrom: undefined })
        : held;
    const photos = (await photosIn(tx, { draftId: id })).length;
    const next = stepAfter('review', { answers, photos }, draft.origin);
    await recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId: id,
      actor: { type: 'person', userId: member.userId },
      type: 'letting.draft_saved',
      data: { step: 'review' },
    });
    // UX-ME-1: the review was confirmed; for a home that was read, with how much was changed.
    await recordFunnelStep(tx, { step: 'add_letting.draft_reviewed', subjectId: id });
    if (draft.reading) {
      await recordFunnelStep(tx, {
        step: 'import.review_confirmed',
        subjectId: id,
        data: { fieldsChanged: fieldsChanged(draftReadingSchema.parse(draft.reading)) },
      });
    }
    if (hasCore(answers)) {
      await becomeLettingIn(tx, member, draft, answers, next);
      return { kind: 'letting', next };
    }
    await tx.update(lettingDrafts).set({ answers, step: next }).where(eq(lettingDrafts.id, id));
    return { kind: 'draft', next };
  });
}
