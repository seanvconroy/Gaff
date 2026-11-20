'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { lettingDetailsFormSchema } from '@/domain/criteria/criteria';
import {
  developmentFactsSchema,
  developmentNameSchema,
  readUnitRows,
  unitTypeRentSchema,
  unitTypeSchema,
} from '@/domain/developments/development';
import {
  developmentPageHref,
  developmentStepHref,
  newTypeHref,
  typeStepHref,
} from '@/domain/developments/links';
import { addressStepSchema } from '@/domain/lettings/add-letting';
import { rentCheckFormSchema } from '@/domain/rent/rent-check';
import { fieldErrors, formValues, invalid, type FormState } from '@/lib/forms';
import { irishToday } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import {
  addUnitType,
  changeDevelopment,
  changeUnitType,
  createDevelopment,
  developmentView,
  makeHomesOfType,
  putTypeLive,
  reachDevelopmentStep,
  recordTypeRentCheck,
  setTypeDetails,
} from '@/server/developments/developments';
import { UserFacingError } from '@/server/errors';
import { setHomePoint } from '@/server/lettings/location';

/**
 * BA-15: the screens of adding a development and its types. Each saves its one question and
 * moves on; "Save and exit" keeps what's valid and goes to the development's page. A problem the
 * person can fix comes back at its field.
 */

function problem(error: unknown, values: Record<string, string>, field = 'form'): FormState {
  if (!(error instanceof UserFacingError)) throw error;
  return invalid({ [error.field ?? field]: error.message }, values);
}

const leave = (id: string) => redirect(developmentPageHref(id));

function refresh(id: string) {
  revalidatePath('/lettings', 'layout');
  revalidatePath(developmentPageHref(id));
}

export async function createDevelopmentAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = developmentNameSchema().safeParse(values);
  if (!parsed.success) {
    if (values.intent === 'exit') redirect('/lettings');
    return invalid(fieldErrors(parsed.error), values);
  }
  let id: string;
  try {
    ({ id } = await createDevelopment(member, parsed.data));
  } catch (error) {
    return problem(error, values, 'name');
  }
  refresh(id);
  if (values.intent === 'exit') leave(id);
  redirect(developmentStepHref(id, 'address'));
}

export async function renameDevelopmentAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = developmentNameSchema().safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  try {
    await changeDevelopment(member, id, 'name', parsed.data);
  } catch (error) {
    return problem(error, values, 'name');
  }
  refresh(id);
  leave(id);
  return {};
}

export async function saveDevelopmentAddressAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = addressStepSchema().safeParse(values);
  if (!parsed.success) {
    if (values.intent === 'exit') leave(id);
    return invalid(fieldErrors(parsed.error), values);
  }
  try {
    await changeDevelopment(member, id, 'address', {
      addressLine1: parsed.data.addressLine1,
      area: parsed.data.area,
      county: parsed.data.county,
      eircode: parsed.data.eircode ?? null,
    });
    await reachDevelopmentStep(member, id, 'pin');
  } catch (error) {
    return problem(error, values);
  }
  refresh(id);
  if (values.intent === 'exit') leave(id);
  redirect(developmentStepHref(id, 'pin'));
}

export async function saveDevelopmentPinAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (values.skip !== '1' && values.intent !== 'exit') {
    try {
      const saved = await setHomePoint(member, id, {
        lat: Number(values.lat),
        lng: Number(values.lng),
      });
      if (!saved.ok) return invalid({ form: saved.error }, values);
    } catch (error) {
      return problem(error, values);
    }
  }
  if (values.intent === 'exit') leave(id);
  await reachDevelopmentStep(member, id, 'facts');
  refresh(id);
  redirect(developmentStepHref(id, 'facts'));
}

export async function saveDevelopmentFactsAction(
  id: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = developmentFactsSchema().safeParse(values);
  if (!parsed.success) {
    if (values.intent === 'exit') leave(id);
    return invalid(fieldErrors(parsed.error), values);
  }
  try {
    await changeDevelopment(member, id, 'facts', {
      parking: parsed.data.parking ?? null,
      description: parsed.data.description ?? null,
    });
    await reachDevelopmentStep(member, id, 'photos');
  } catch (error) {
    return problem(error, values);
  }
  refresh(id);
  if (values.intent === 'exit') leave(id);
  redirect(developmentStepHref(id, 'photos'));
}

/** The development's photos are kept as they upload: this only moves on, to its first type. */
export async function developmentPhotosDoneAction(id: string): Promise<void> {
  const member = await requireMember();
  await reachDevelopmentStep(member, id, 'types');
  refresh(id);
  const view = await developmentView(member, id);
  redirect(view && view.types.length > 0 ? developmentPageHref(id) : newTypeHref(id));
}

export async function addTypeAction(
  developmentId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = unitTypeSchema().safeParse(values);
  if (!parsed.success) {
    if (values.intent === 'exit') leave(developmentId);
    return invalid(fieldErrors(parsed.error), values);
  }
  let id: string;
  try {
    ({ id } = await addUnitType(member, developmentId, parsed.data));
  } catch (error) {
    return problem(error, values);
  }
  refresh(developmentId);
  if (values.intent === 'exit') leave(developmentId);
  redirect(typeStepHref(developmentId, id, 'rent'));
}

export async function saveTypeAction(
  developmentId: string,
  typeId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = unitTypeSchema().safeParse(values);
  if (!parsed.success) {
    if (values.intent === 'exit') leave(developmentId);
    return invalid(fieldErrors(parsed.error), values);
  }
  try {
    await changeUnitType(member, typeId, 'home', parsed.data);
  } catch (error) {
    return problem(error, values);
  }
  refresh(developmentId);
  if (values.intent === 'exit') leave(developmentId);
  redirect(typeStepHref(developmentId, typeId, 'rent'));
}

export async function saveTypeRentAction(
  developmentId: string,
  typeId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = unitTypeRentSchema().safeParse(values);
  if (!parsed.success) {
    if (values.intent === 'exit') leave(developmentId);
    return invalid(fieldErrors(parsed.error), values);
  }
  try {
    await changeUnitType(member, typeId, 'rent', parsed.data);
  } catch (error) {
    return problem(error, values, 'count');
  }
  refresh(developmentId);
  if (values.intent === 'exit') leave(developmentId);
  redirect(typeStepHref(developmentId, typeId, 'photos'));
}

/** The type's photos are kept as they upload: this only moves on, to its homes. */
export async function typePhotosDoneAction(developmentId: string, typeId: string): Promise<void> {
  await requireMember();
  refresh(developmentId);
  redirect(typeStepHref(developmentId, typeId, 'homes'));
}

/** M35: "Which homes are they?": every row at once, each problem at its own field. */
export async function makeHomesAction(
  developmentId: string,
  typeId: string,
  count: number,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const { rows, errors } = readUnitRows(values, count);
  if (Object.keys(errors).length > 0) {
    if (values.intent === 'exit') leave(developmentId);
    return invalid(errors, values);
  }
  try {
    await makeHomesOfType(member, typeId, rows);
  } catch (error) {
    return problem(error, values);
  }
  refresh(developmentId);
  if (values.intent === 'exit') leave(developmentId);
  redirect(typeStepHref(developmentId, typeId, 'details'));
}

export async function saveTypeDetailsAction(
  developmentId: string,
  typeId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  const parsed = lettingDetailsFormSchema().safeParse(values);
  if (!parsed.success) {
    if (values.intent === 'exit') leave(developmentId);
    return invalid(fieldErrors(parsed.error), values);
  }
  try {
    await setTypeDetails(member, typeId, parsed.data);
  } catch (error) {
    return problem(error, values);
  }
  refresh(developmentId);
  if (values.intent === 'exit') leave(developmentId);
  redirect(typeStepHref(developmentId, typeId, 'rent-check'));
}

export async function saveTypeRentCheckAction(
  developmentId: string,
  typeId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  const values = formValues(formData);
  if (values.intent === 'exit') leave(developmentId);
  const parsed = rentCheckFormSchema(irishToday()).safeParse(values);
  if (!parsed.success) return invalid(fieldErrors(parsed.error), values);
  try {
    await recordTypeRentCheck(member, typeId, parsed.data);
  } catch (error) {
    return problem(error, values);
  }
  refresh(developmentId);
  redirect(typeStepHref(developmentId, typeId, 'review'));
}

/** M35: "Put 4 homes live": each home's go-live is this person's own decision. */
export async function putTypeLiveAction(
  developmentId: string,
  typeId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const member = await requireMember();
  let outcome: Awaited<ReturnType<typeof putTypeLive>>;
  try {
    outcome = await putTypeLive(member, typeId);
  } catch (error) {
    return problem(error, {});
  }
  refresh(developmentId);
  revalidatePath('/today');
  redirect(`${developmentPageHref(developmentId)}?live=${outcome.live}&held=${outcome.held}`);
}
