'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/server/auth/staff';
import { UserFacingError } from '@/server/errors';
import { decideCase } from '@/server/trust/staff';

/**
 * UX-TS-4, BA-9 (Q13, Q53): what Gaff's own team can do about a reported listing, and nothing
 * more: decide its case. No action (which puts back a listing the rules took off), or hide it,
 * with a reason and the facts it relies on. It asks `requireStaff()` itself, so anyone else
 * gets "not found", signed in or not.
 */
export async function decideCaseAction(
  caseId: string,
  decision: 'no_action' | 'hide_listing',
  formData: FormData,
): Promise<void> {
  const staff = await requireStaff();
  let done: string;
  try {
    const input =
      decision === 'hide_listing'
        ? {
            caseId,
            decision,
            reason: String(formData.get('reason') ?? ''),
            facts: formData.getAll('facts').map(String),
          }
        : { caseId, decision };
    await decideCase(staff, input);
    done = String(formData.get('done') ?? decision);
  } catch (error) {
    if (!(error instanceof UserFacingError)) throw error;
    redirect('/internal?problem=case#reported');
  }
  revalidatePath('/', 'layout');
  redirect(`/internal?done=${encodeURIComponent(done)}#reported`);
}
