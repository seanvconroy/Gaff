'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { firstRunCopy } from '@/copy/first-run';
import { landingFor, nameSchema, purposeFromNext, purposes } from '@/domain/accounts/first-run';
import { safeNextPath } from '@/domain/auth/next-path';
import { formValues, invalid, type FormState } from '@/lib/forms';
import {
  askToJoin,
  claimAgency,
  findRegisterEntryByLicence,
  rememberAgencyStep,
  startAgencyWithoutLicence,
} from '@/server/accounts/agencies';
import { ensureOwnHomes, saveName, startRenting } from '@/server/accounts/contexts';
import { currentUser } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { welcomeHref } from './href';

/** The signed-in person. First run's answers are always their own. */
async function person() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  return user;
}

/** Every page shows who is signed in and what they hold, so each is drawn afresh after a change. */
function changed(): void {
  revalidatePath('/', 'layout');
}

/** "What's your name?" Saved once on the profile, and never asked again (UX-AC-6). */
export async function answerName(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await person();
  const values = formValues(formData);
  const parsed = nameSchema.safeParse(values.name ?? '');
  if (!parsed.success) return invalid({ name: parsed.error.issues[0]!.message }, values);
  const name = await saveName(user, parsed.data);
  changed();

  // Where they were going says why they came: nothing more is asked.
  const next = safeNextPath(values.next);
  const purpose = purposeFromNext(next);
  if (purpose === 'own_home') {
    await ensureOwnHomes({ ...user, name });
    redirect(next!);
  }
  if (purpose === 'renting') {
    await startRenting(user);
    redirect(next!);
  }
  const then = values.then === 'agency' ? 'agency' : undefined;
  redirect(welcomeHref({ step: then, next, named: true }));
}

/** "What brings you to Gaff?" Choosing here fixes nothing (UX-AC-8). */
export async function answerPurpose(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await person();
  const values = formValues(formData);
  const parsed = z.enum(purposes).safeParse(values.purpose);
  if (!parsed.success) return invalid({ purpose: firstRunCopy.purpose.missing }, values);
  if (parsed.data === 'renting') {
    await startRenting(user);
  } else if (parsed.data === 'own_home') {
    // UX-AC-4, UX-AC-7: the organisation of one is made here, silently. Nothing more is asked.
    await ensureOwnHomes(user);
  } else {
    await rememberAgencyStep(user, null);
    redirect(welcomeHref({ step: 'agency', named: values.named === '1' }));
  }
  changed();
  redirect(landingFor(parsed.data));
}

/** UX-AG-2: "Enter the licence number instead". */
export async function findByLicence(_state: FormState, formData: FormData): Promise<FormState> {
  await person();
  const values = formValues(formData);
  const found = await findRegisterEntryByLicence(values.licence ?? '');
  if (!found.ok) return invalid({ licence: found.error }, values);
  redirect(welcomeHref({ step: 'confirm', entry: found.entry.id, named: values.named === '1' }));
}

/** UX-AG-2: "We're applying for a licence": everything can be set up; nothing goes live yet. */
export async function startApplying(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await person();
  const values = formValues(formData);
  try {
    await startAgencyWithoutLicence(user, values.agencyName ?? '');
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    return invalid({ agencyName: error.message }, values);
  }
  changed();
  redirect(landingFor('agency'));
}

/** "Yes, that's us" (UX-AG-4). The agency is set up, and is being confirmed. */
export async function claimAgencyAction(formData: FormData): Promise<void> {
  const user = await person();
  const entry = String(formData.get('entry') ?? '');
  let result;
  try {
    result = await claimAgency(user, entry);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(welcomeHref({ step: 'agency' }));
  }
  // Someone confirmed it a moment ago: the screen now offers "Ask to join" (UX-AG-3).
  if (result.result === 'already_on_gaff') redirect(welcomeHref({ step: 'confirm', entry }));
  changed();
  redirect(landingFor('agency'));
}

/** UX-AG-3: "Ask to join" an agency that's already on Gaff. */
export async function askToJoinAction(formData: FormData): Promise<void> {
  const user = await person();
  const entry = String(formData.get('entry') ?? '');
  try {
    await askToJoin(user, entry);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect(welcomeHref({ step: 'agency' }));
  }
  redirect(welcomeHref({ step: 'confirm', entry }));
}
