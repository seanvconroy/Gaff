'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { allowMoreTries } from '@/server/identity/staff';
import { decideLicenceCheck, type LicenceDecision } from '@/server/verification/licence';

const decisions: Record<string, LicenceDecision> = {
  passed: { outcome: 'passed' },
  name_differs: { outcome: 'failed', reason: 'name_differs' },
  not_current: { outcome: 'failed', reason: 'not_current' },
  not_found: { outcome: 'failed', reason: 'not_found' },
};

/** M23, M105: a person at Gaff decides a licence check after looking at the PSRA register. */
export async function decideAction(checkId: string, formData: FormData): Promise<void> {
  const staff = await requireStaff();
  const decision = decisions[String(formData.get('decision') ?? '')];
  if (!decision) redirect('/staff/checks');
  try {
    await decideLicenceCheck(staff, checkId, decision);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
  }
  revalidatePath('/staff/checks');
  redirect('/staff/checks?saved=1');
}

/** P25 (Q60): a person at Gaff gives someone Stripe couldn't verify three more tries. */
export async function moreTriesAction(userId: string): Promise<void> {
  const staff = await requireStaff();
  try {
    await allowMoreTries(staff, userId);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
  }
  revalidatePath('/staff/checks');
  redirect('/staff/checks?saved=1');
}
