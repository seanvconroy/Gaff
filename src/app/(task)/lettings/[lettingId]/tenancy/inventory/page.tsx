import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { operatorStepHref } from '@/domain/tenancy/operator-steps';
import { inventoryFor } from '@/server/tenancy/movein';
import { itemAction } from '../actions';
import { loadStep, type StepProps } from '../step';
import { ItemStep } from './ItemStep';

export const metadata: Metadata = { title: 'Add to the inventory' };
export const dynamic = 'force-dynamic';

/** UX-TN-4 (R25): one inventory item per screen, opened from "Hand over the keys". */
export default async function InventoryItemPage({ params }: StepProps) {
  const { member, view, lettingId } = await loadStep(params, 'hand_over');
  const moveInHref = operatorStepHref(lettingId, 'hand_over');
  // Once the tenant has confirmed it's a fair record, the inventory can't change.
  if (view.tenancy.inventoryConfirmedAt) redirect(moveInHref);
  const items = await inventoryFor(member, lettingId);
  return (
    <ItemStep
      action={itemAction.bind(null, lettingId)}
      leaveHref={moveInHref}
      doneHref={moveInHref}
      count={items.length}
      lastRoom={items.at(-1)?.room ?? ''}
    />
  );
}
