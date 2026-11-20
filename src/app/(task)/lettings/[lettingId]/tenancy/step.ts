import { notFound, redirect } from 'next/navigation';
import { firstNameOf } from '@/domain/accounts/first-run';
import {
  operatorSteps,
  type OperatorStepKey,
  type OperatorStepState,
} from '@/domain/tenancy/operator-steps';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { tenancyFor } from '@/server/tenancy/tenancy';

/**
 * UX-TN-1: what every tenancy step's focused screen starts from: the member, the tenancy, and
 * where this step stands. A step that can't start yet goes back to the letting's Tenancy page.
 */
export async function loadStep(params: Promise<{ lettingId: string }>, key: OperatorStepKey) {
  const { lettingId } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(lettingId)) notFound();
  // UX-AC-14: a member who applied for this home as a renter can't work on its letting.
  if (await stoppedByConflict(member, lettingId)) redirect('/lettings/yours');
  const tenancyHref = `/lettings/${lettingId}/tenancy`;
  const view = await tenancyFor(member, lettingId);
  if (!view) redirect(tenancyHref);
  const state: OperatorStepState =
    operatorSteps(view.tenancy).find((step) => step.key === key)?.state ?? 'to_come';
  if (state === 'to_come') redirect(tenancyHref);
  return {
    member,
    view,
    lettingId,
    state,
    tenancyHref,
    first: firstNameOf(view.tenant.fullName) || 'the tenant',
    isAgency: view.organisation.kind === 'agency',
  };
}

export type StepProps = { params: Promise<{ lettingId: string }> };
