'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { FIRST_TIME_SETTINGS } from '@/domain/viewings/calendar';
import { viewingSessionSchema } from '@/domain/viewings/viewing-session';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { requireMember } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import {
  addViewingSession,
  changeViewingSession,
  removeViewingSession,
} from '@/server/lettings/viewing-sessions';

/** What the time sheet hears back: field errors, or what was done and on which day. */
export interface TimeFormState extends FormState {
  done?: { message: string; date: string };
}

const id = z.uuid();

function refresh(lettingId: string): void {
  revalidatePath('/calendar');
  revalidatePath(`/lettings/${lettingId}`, 'layout');
  revalidatePath('/today');
}

function problem(error: unknown, values: Record<string, string>): TimeFormState {
  if (error instanceof UserFacingError) {
    return invalid({ [error.field ?? 'form']: error.message }, values);
  }
  throw error;
}

/** UX-VW-3: "Add a time": one sheet, at most five fields. */
export async function addTimeAction(
  _state: TimeFormState,
  formData: FormData,
): Promise<TimeFormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const home = id.safeParse(values.home);
  if (!home.success) return invalid({ home: 'Choose the home this time is for.' }, values);
  const parsed = viewingSessionSchema().safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  try {
    await addViewingSession(member, home.data, parsed.data);
  } catch (error) {
    return problem(error, values);
  }
  refresh(home.data);
  return { done: { message: 'Viewing time added', date: values.date! } };
}

/** UX-VW-6: "Change": the same fields; with people booked, the day and start only. */
export async function changeTimeAction(
  lettingId: string,
  sessionId: string,
  _state: TimeFormState,
  formData: FormData,
): Promise<TimeFormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (!id.safeParse(lettingId).success || !id.safeParse(sessionId).success) {
    return invalid({ form: 'That viewing time has already gone.' }, values);
  }
  const parsed = viewingSessionSchema().safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  let result;
  try {
    result = await changeViewingSession(member, lettingId, sessionId, parsed.data);
  } catch (error) {
    return problem(error, values);
  }
  refresh(lettingId);
  const told = result.told;
  return {
    done: {
      message:
        told > 0
          ? `Viewing time moved. ${told} ${told === 1 ? 'person is' : 'people are'} being told`
          : 'Viewing time changed',
      date: values.date!,
    },
  };
}

/** UX-VW-6: "Cancel this time". */
export async function cancelTimeAction(
  lettingId: string,
  sessionId: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const member = await requireMember();
  if (!id.safeParse(lettingId).success || !id.safeParse(sessionId).success) {
    return { ok: false, message: 'That viewing time has already gone.' };
  }
  try {
    const { told } = await removeViewingSession(member, lettingId, sessionId);
    refresh(lettingId);
    return {
      ok: true,
      message:
        told > 0
          ? `Viewing time cancelled. ${told} ${told === 1 ? 'person is' : 'people are'} being told`
          : 'Viewing time cancelled',
    };
  } catch (error) {
    if (error instanceof UserFacingError) return { ok: false, message: error.message };
    throw error;
  }
}

/** UX-VW-4: a suggested time, added with one tap, with the home's last settings. */
export async function addSuggestedAction(
  lettingId: string,
  suggestion: { date: string; start: string; end: string },
  settings: {
    kind: 'slots' | 'group';
    slotMinutes: number;
    capacity: number;
  } = FIRST_TIME_SETTINGS,
): Promise<{ ok: boolean; message: string }> {
  const member = await requireMember();
  if (!id.safeParse(lettingId).success)
    return { ok: false, message: 'We couldn’t find that home.' };
  const parsed = viewingSessionSchema().safeParse({ ...settings, ...suggestion });
  if (!parsed.success) return { ok: false, message: 'That time has passed. Choose another.' };
  try {
    await addViewingSession(member, lettingId, parsed.data);
  } catch (error) {
    if (error instanceof UserFacingError) return { ok: false, message: error.message };
    throw error;
  }
  refresh(lettingId);
  return { ok: true, message: 'Viewing time added' };
}
