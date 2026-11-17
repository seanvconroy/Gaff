'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { addressSearch } from '@/adapters/address';
import { addLettingCopy } from '@/copy/add-letting';
import { lettingDetailsFormSchema } from '@/domain/criteria/criteria';
import {
  type CoreStep,
  type DraftAnswers,
  addressStepSchema,
  advertLinksIn,
  descriptionSchema,
  homeFactsSchema,
  homeStepSchema,
  partialAnswers,
  rentStepSchema,
} from '@/domain/lettings/add-letting';
import { isOnlyLinks, MAX_ADVERT_CHARS } from '@/domain/lettings/advert-reading';
import { berRatings, parseEuroToCents } from '@/domain/lettings/new-letting';
import type { Portal } from '@/domain/lettings/setup';
import { forwardingHref } from '@/domain/enquiries/forwarding';
import { returnPath } from '@/domain/navigation/return-to';
import { phoneFieldSchema } from '@/domain/organisations/phone';
import { rentCheckFormSchema } from '@/domain/rent/rent-check';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { irishToday } from '@/lib/format';
import type { AddressSuggestion, PostalAddress } from '@/ports/address-search';
import { ensureOwnHomes } from '@/server/accounts/contexts';
import { startPersonCheck } from '@/server/identity/person-checks';
import { currentUser, findMember, type Member, requireMember } from '@/server/auth/member';
import { forwardingStillToDoFor } from '@/server/enquiries/forwarding';
import { UserFacingError } from '@/server/errors';
import { readAdvertIntoDraft } from '@/server/lettings/advert-reader';
import { readingIsOffered } from '@/server/lettings/reader-setting';
import {
  confirmReview,
  keepAdvertLinks,
  reachStep,
  saveAnswers,
  startDraft,
} from '@/server/lettings/drafts';
import { setAdvertisedOn, startTakingEnquiries } from '@/server/lettings/go-live';
import { letAgain } from '@/server/lettings/let-again';
import { addPhoto, photoProblems, removePhoto, reorderPhotos } from '@/server/lettings/photos';
import { getLetting } from '@/server/lettings/queries';
import { changeAskingRent, recordRentCheck, rentCheckProblem } from '@/server/lettings/rent-check';
import { setLettingDetails } from '@/server/lettings/set-criteria';
import { sendTestEnquiry } from '@/server/lettings/test-enquiry';
import type { UploadResult } from '@/ui/PhotoUploader';
import { screenHref, startHref } from '@/domain/lettings/links';

const copy = addLettingCopy;

/**
 * UX-AC-4: someone adding their first home, who lets nothing yet, is a private landlord. Their
 * organisation of one is made here, silently, the first time something about the home is
 * saved: no name asked, no licence.
 */
async function memberOrBecomeOne(): Promise<Member> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  let member = await findMember(user.id);
  if (!member) {
    const { organisationId } = await ensureOwnHomes(user);
    member = await findMember(user.id, organisationId);
    revalidatePath('/', 'layout');
  }
  if (!member) redirect('/welcome');
  return member;
}

/** Where "Save and exit" goes: the page the task was opened on, or Lettings. */
async function leaveTo(from: string | null): Promise<string> {
  const user = await currentUser();
  const member = user ? await findMember(user.id) : null;
  return returnPath(from ?? undefined, member ? '/lettings' : '/');
}

/** A problem the person can fix comes back at its field; anything else is a real error. */
function problem(error: unknown, values: Record<string, string>, field = 'form'): FormState {
  if (!(error instanceof UserFacingError)) throw error;
  return invalid({ [error.field ?? field]: error.message }, values);
}

/**
 * Step 1 (UX-LT-1, UX-LT-2, UX-LT-8). A Daft or MyHome link is kept, to match enquiries, and
 * never fetched (Q31); any other link is not opened either, and the box asks for the advert's
 * words instead. Words are read into a draft, which opens at its review ("Here's what Gaff
 * found"). If the reader is off, slow or down, the box says so and keeps what was typed, and
 * "Fill it in myself" is on the same screen (UX-AI-12).
 */
export async function startAction(
  draftId: string | null,
  from: string | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const about = (values.about ?? '').slice(0, MAX_ADVERT_CHARS * 2);
  const links = advertLinksIn(about);
  let id = draftId;
  if (links.daftUrl || links.myhomeUrl) {
    const member = await memberOrBecomeOne();
    id = (await keepAdvertLinks(member, draftId, links)).id;
    if (links.alone) redirect(`${startHref(from, id)}&kept=1`);
  }
  const kept = { ...values, ...(id ? { draft: id } : {}) };
  if (!about.trim()) return invalid({ about: copy.start.empty }, kept);
  if (!(await readingIsOffered())) return invalid({ about: copy.start.readerOff }, kept);
  // Q31: a link is never opened, so a link on its own gives Gaff nothing to read.
  if (isOnlyLinks(about)) return invalid({ about: copy.start.linkNotOpened }, kept);
  const member = await memberOrBecomeOne();
  const outcome = await readAdvertIntoDraft(member, { text: about, draftId: id });
  if (outcome.kind === 'nothing_found') return invalid({ about: copy.start.couldNotMakeOut }, kept);
  if (outcome.kind === 'unavailable') return invalid({ about: copy.start.notJustNow }, kept);
  revalidatePath('/lettings');
  redirect(screenHref(outcome.id, 'review', from));
}

const stepSchemas = {
  address: () => addressStepSchema(),
  rent: () => rentStepSchema(),
  home: () => homeStepSchema(),
  description: () => descriptionSchema(),
} satisfies Record<CoreStep | 'description', () => z.ZodType>;

/**
 * Steps 3 to 5: the address, the rent and date, the home. Saved as the person goes (UX-FL-2).
 * `id` is null only on the very first save, when the draft, and for a new private landlord
 * their organisation of one, are made.
 */
export async function saveStepAction(
  step: CoreStep,
  id: string | null,
  from: string | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  if (values.intent === 'exit') {
    // "Save and exit": keep what reads cleanly, and never hold the person up.
    const patch = partialAnswers(step, values);
    if (Object.keys(patch).length > 0) {
      const member = await memberOrBecomeOne();
      const home = id ?? (await startDraft(member, { origin: 'manual' })).id;
      try {
        await saveAnswers(member, home, { step, patch, advance: false });
      } catch (error) {
        if (!(error instanceof UserFacingError)) throw error;
      }
    }
    redirect(await leaveTo(from));
  }
  // The address fields aren't on screen until an address is picked or "Enter it myself" pressed.
  if (step === 'address' && values.addressLine1 === undefined) {
    return invalid({ addressSearch: copy.address.choose }, values);
  }
  const parsed = stepSchemas[step]().safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  const member = await memberOrBecomeOne();
  const home = id ?? (await startDraft(member, { origin: 'manual' })).id;
  let next;
  try {
    ({ next } = await saveAnswers(member, home, {
      step,
      patch: parsed.data as Partial<DraftAnswers>,
      advance: true,
    }));
  } catch (error) {
    return problem(error, values);
  }
  redirect(screenHref(home, next, from));
}

/**
 * UX-LT-4: one of the review screen's sheets. It saves and stays: the sheet closes and the
 * preview shows the change. `details` is the letting details a draft carries in.
 */
export async function saveReviewAction(
  group: CoreStep | 'description' | 'details',
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  let patch: Partial<DraftAnswers>;
  if (group === 'details') {
    const parsed = lettingDetailsFormSchema().safeParse(values);
    if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
    patch = {
      criteria: parsed.data.criteria,
      noSmokingIndoors: parsed.data.noSmokingIndoors || undefined,
    };
  } else {
    // The review's "The home" sheet has no description or facts: they have a sheet of their own.
    const schema = group === 'home' ? homeFactsSchema : stepSchemas[group];
    const parsed = schema().safeParse(values);
    if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
    patch = parsed.data as Partial<DraftAnswers>;
  }
  try {
    await saveAnswers(member, id, { step: group, patch, advance: false });
  } catch (error) {
    return problem(error, values);
  }
  revalidatePath(`/lettings/${id}/setup`, 'layout');
  return { ...invalid({}, { saved: '1' }) };
}

/** UX-LT-4, UX-LT-5: "Looks right". On to the first step that still needs an answer. */
export async function confirmReviewAction(id: string, from: string | null): Promise<void> {
  const member = await requireMember();
  const { next } = await confirmReview(member, id);
  redirect(screenHref(id, next, from));
}

/** UX-LT-9: addresses that match what's typed. Nothing typed is kept or logged. */
export async function suggestAddressesAction(query: string): Promise<AddressSuggestion[]> {
  if (!(await currentUser())) return [];
  return addressSearch().suggest(String(query).slice(0, 120));
}

/** UX-LT-9: the full postal address of the one that was picked. */
export async function lookUpAddressAction(id: string): Promise<PostalAddress | null> {
  if (!(await currentUser())) return null;
  return addressSearch().lookUp(String(id).slice(0, 120));
}

/** UX-LT-10: one photo. Each is sent on its own, so one that fails doesn't stop the others. */
export async function uploadPhotoAction(id: string, formData: FormData): Promise<UploadResult> {
  const member = await requireMember();
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: photoProblems.not_a_photo };
  }
  const result = await addPhoto(member, id, Buffer.from(await file.arrayBuffer()));
  return result.ok ? result : { ok: false, message: photoProblems[result.problem] };
}

export async function removePhotoAction(id: string, photoId: string): Promise<void> {
  const member = await requireMember();
  await removePhoto(member, id, photoId);
}

export async function reorderPhotosAction(id: string, order: string[]): Promise<void> {
  const member = await requireMember();
  await reorderPhotos(member, id, { order: order.map(String).slice(0, 60) });
}

/** Step 6 is done, with photos or with "Skip for now": nothing about it blocks anything. */
export async function photosDoneAction(
  id: string,
  from: string | null,
  then: 'details' | 'go_live',
): Promise<void> {
  const member = await requireMember();
  await reachStep(member, id, then);
  redirect(screenHref(id, then, from));
}

/**
 * UX-LP-11, UX-LP-12: "Change" on the facts or the description, from Home on the letting's
 * page. It saves and goes back there. A live home's facts change at any time, and Gaff answers
 * from them as they are from then on.
 */
export async function saveHomePartAction(
  part: 'home' | 'description',
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (values.intent === 'exit') redirect(`/lettings/${id}?view=home`);
  const parsed = (part === 'home' ? homeFactsSchema : descriptionSchema)().safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  try {
    await saveAnswers(member, id, {
      step: part,
      patch: parsed.data as Partial<DraftAnswers>,
      advance: false,
    });
  } catch (error) {
    return problem(error, values);
  }
  revalidatePath(`/lettings/${id}`, 'layout');
  redirect(`/lettings/${id}?view=home&saved=${part === 'home' ? 'facts' : 'description'}`);
}

/** UX-LP-11: photos changed from Home. Each was kept as it uploaded: this only goes back. */
export async function photosChangedAction(id: string): Promise<void> {
  await requireMember();
  revalidatePath(`/lettings/${id}`, 'layout');
  redirect(`/lettings/${id}?view=home&saved=photos`);
}

/**
 * Step 7, letting details (UX-LT-11): the four fixed criteria and the one house rule. Opened
 * on its own from the letting's page (`alone`), it saves and goes back there.
 */
export async function saveDetailsAction(
  id: string,
  from: string | null,
  alone: boolean,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = lettingDetailsFormSchema().safeParse(values);
  if (!parsed.success) {
    if (values.intent === 'exit') redirect(await leaveTo(from));
    return invalid(fieldErrors(parsed.error), values);
  }
  try {
    await setLettingDetails(member, id, parsed.data);
  } catch (error) {
    return problem(error, values);
  }
  revalidatePath(`/lettings/${id}`, 'layout');
  if (alone) redirect(`/lettings/${id}?view=home&saved=criteria`);
  await reachStep(member, id, 'rent_check');
  if (values.intent === 'exit') redirect(await leaveTo(from));
  redirect(screenHref(id, 'rent_check', from));
}

/**
 * Step 8, the rent check (UX-LT-12): the answers from its one-question screens, checked
 * against the rent the letting already has. Its result is its own screen (UX-LT-13).
 */
export async function saveRentCheckAction(
  id: string,
  from: string | null,
  alone: boolean,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (values.intent === 'exit') redirect(await leaveTo(from));
  const parsed = rentCheckFormSchema(irishToday()).safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  try {
    await recordRentCheck(member, id, parsed.data);
  } catch (error) {
    return problem(error, values);
  }
  revalidatePath(`/lettings/${id}`, 'layout');
  redirect(screenHref(id, 'rent_result', from, { alone: alone ? '1' : null }));
}

/**
 * UX-LT-13: the result screen's one action. Where the asking rent is above what the rules
 * allow, that action is to change the rent, in a field on that screen. Otherwise it is Next.
 */
export async function rentResultAction(
  id: string,
  from: string | null,
  alone: boolean,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const detail = await getLetting(member, id);
  if (!detail) return invalid({ form: 'We couldn’t find that letting.' }, values);
  const over = rentCheckProblem(detail.rentCheck, detail.letting.monthlyRentCents);
  if (over) {
    if (values.intent === 'exit') redirect(await leaveTo(from));
    const cents = parseEuroToCents(values.rent ?? '');
    if (cents === null) {
      return invalid({ rent: 'Enter the monthly rent in euro, like 1,850' }, values);
    }
    if (cents > over.ceilingCents) {
      return invalid({ rent: copy.rentResult.tooHigh(over.ceilingCents) }, values);
    }
    try {
      await changeAskingRent(member, id, cents);
    } catch (error) {
      return problem(error, values, 'rent');
    }
    revalidatePath(`/lettings/${id}`, 'layout');
    // The same screen again, now with the rent inside the rules and Next as its one action.
    redirect(screenHref(id, 'rent_result', from, { alone: alone ? '1' : null, changed: '1' }));
  }
  if (alone) redirect(`/lettings/${id}?view=home&saved=rent-check`);
  await reachStep(member, id, 'go_live');
  if (values.intent === 'exit') redirect(await leaveTo(from));
  redirect(screenHref(id, 'go_live', from));
}

/**
 * Step 9 (UX-LT-15): going live is a person's decision, recorded as theirs. What the screen
 * asked for along the way (a number renters can call, a missing BER, "On gaff.ie") is saved
 * with it. None of them is needed: only what UX-LT-14 lists can stop a home going live.
 */
export async function goLiveAction(
  id: string,
  from: string | null,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (values.intent === 'exit') redirect(await leaveTo(from));
  const errors: Record<string, string> = {};
  const phone = phoneFieldSchema.safeParse(values.phone);
  if (!phone.success) errors.phone = phone.error.issues[0]!.message;
  const ber = values.berRating
    ? berRatings.find((rating) => rating === values.berRating)
    : undefined;
  if (values.berRating && !ber) errors.berRating = 'Choose the BER rating';
  if (Object.keys(errors).length > 0) return invalid(errors, values);

  let went: 'live' | 'held';
  try {
    went = await startTakingEnquiries(member, id, {
      onGaff: values.onGaffAsked === '1' ? values.onGaff === 'on' : undefined,
      berRating: ber,
      phone: phone.success ? phone.data : undefined,
    });
  } catch (error) {
    return problem(error, values);
  }
  revalidatePath('/', 'layout');
  // UX-AG-4: held while the agency is being confirmed. The letting's page says so.
  redirect(went === 'live' ? screenHref(id, 'advertised', from) : `/lettings/${id}`);
}

/**
 * UX-TS-2 (Q47): "Confirm it's you", a private landlord's one check before their first home goes
 * live. It opens the ID service, which sends them back to this go-live step.
 */
export async function confirmItsYouAction(id: string, from: string | null): Promise<void> {
  const member = await requireMember();
  const back = screenHref(id, 'go_live', from);
  const started = await startPersonCheck(member.userId, 'go_live', back);
  if ('problem' in started) {
    redirect(started.problem === 'done' ? back : `${back}${back.includes('?') ? '&' : '?'}identity_problem=${started.problem}`);
  }
  redirect(started.redirectUrl);
}

/** After go-live: "Is it advertised anywhere else?" Daft, MyHome, or No. */
export async function advertisedAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const chosen = formData.getAll('where').map(String);
  const values = { where: chosen.join(',') };
  const no = chosen.includes('no');
  const on = chosen.filter((value): value is Portal => value === 'daft' || value === 'myhome');
  if (chosen.length === 0) return invalid({ where: copy.advertised.choose }, values);
  if (no && on.length > 0) return invalid({ where: copy.advertised.notBoth }, values);
  try {
    await setAdvertisedOn(member, id, on);
  } catch (error) {
    return problem(error, values, 'where');
  }
  revalidatePath(`/lettings/${id}`, 'layout');
  // Section 4: Daft or MyHome leads to forwarding their enquiries, if it isn't in place yet.
  if (on.length > 0 && (await forwardingStillToDoFor(member))) {
    redirect(forwardingHref({ lettingId: id, justLive: true }));
  }
  redirect(`/lettings/${id}?saved=live`);
}

/** UX-LT-24: what a renter gets, on a made-up enquiry. Nothing is sent to anyone. */
export async function testEnquiryAction(
  id: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  try {
    const reply = await sendTestEnquiry(member, id);
    return invalid(
      {},
      { subject: reply.subject, body: reply.body, asks: reply.asksQuestions ? '1' : '' },
    );
  } catch (error) {
    return problem(error, {});
  }
}

/** UX-LT-23: "Let it again", from a closed letting's menu. Opens on the review screen. */
export async function letAgainAction(lettingId: string): Promise<void> {
  const member = await requireMember();
  const { id } = await letAgain(member, lettingId);
  redirect(screenHref(id, 'review', `/lettings/${lettingId}`));
}
