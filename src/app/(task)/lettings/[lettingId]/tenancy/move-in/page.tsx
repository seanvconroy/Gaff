import type { Metadata } from 'next';
import { tenancyCopy } from '@/copy/tenancy-steps';
import { checklistItems } from '@/domain/tenancy/movein';
import { finishHref } from '@/domain/tenancy/operator-steps';
import { canFinish } from '@/domain/tenancy/steps';
import { formatDate } from '@/lib/format';
import { inventoryFor } from '@/server/tenancy/movein';
import { ButtonLink } from '@/ui/Button';
import { Stack } from '@/ui/Layout';
import { moveInAction } from '../actions';
import { loadStep, type StepProps } from '../step';
import { StepDone } from '../StepDone';
import { StepForm } from '../StepForm';
import { InventoryList } from './InventoryList';
import styles from './movein.module.css';

export const metadata: Metadata = { title: 'Hand over the keys' };
export const dynamic = 'force-dynamic';

const copy = tenancyCopy.moveIn;

/**
 * Step 6 (UX-TN-1, R25): the move-in checklist and the inventory, room by room. Items are added
 * one at a time on their own screen (UX-TN-4). Saving with the inventory in shares it with the
 * tenant, who checks it on their phone (UX-RN-25).
 */
export default async function MoveInPage({ params }: StepProps) {
  const { member, view, lettingId, state, tenancyHref, first } = await loadStep(
    params,
    'hand_over',
  );
  const { tenancy } = view;
  const items = await inventoryFor(member, lettingId);
  const shared = tenancy.inventorySharedAt !== null;
  const status = tenancy.inventoryConfirmedAt
    ? copy.confirmed(first, formatDate(tenancy.inventoryConfirmedAt))
    : tenancy.inventorySharedAt
      ? copy.shared(first, formatDate(tenancy.inventorySharedAt))
      : null;

  if (state === 'done') {
    return (
      <StepDone
        leaveHref={tenancyHref}
        title={copy.doneTitle}
        onwards={
          canFinish(tenancy)
            ? { href: finishHref(lettingId), label: tenancyCopy.overview.finish }
            : { href: tenancyHref, label: tenancyCopy.done }
        }
      >
        <p>
          {tenancy.moveInCompletedAt ? `${formatDate(tenancy.moveInCompletedAt)}. ` : ''}
          {status ?? copy.doneText(first)}
        </p>
        <InventoryList lettingId={lettingId} items={items} removable={false} />
      </StepDone>
    );
  }

  const checklist = tenancy.moveInChecklist ?? {};
  const share = items.length > 0 && !shared;
  return (
    <StepForm
      action={moveInAction.bind(null, lettingId)}
      leave={{ kind: 'close', href: tenancyHref }}
      title={copy.title}
      lead={copy.lead(first)}
      fields={[
        {
          kind: 'choice',
          name: 'checklist',
          legend: copy.checklist,
          type: 'checkbox',
          options: checklistItems.map((c) => ({ value: c.name, label: c.label })),
          defaultValue: checklistItems
            .filter((c) => checklist[c.name] === 'yes')
            .map((c) => c.name),
        },
        {
          kind: 'text',
          name: 'electricity',
          label: copy.electricity,
          optional: true,
          width: 'medium',
          inputMode: 'numeric',
          defaultValue: checklist.electricity ?? '',
        },
        {
          kind: 'text',
          name: 'gas',
          label: copy.gas,
          optional: true,
          width: 'medium',
          inputMode: 'numeric',
          defaultValue: checklist.gas ?? '',
        },
      ]}
      primary={share ? copy.share(first) : copy.save}
      primaryIntent={share ? 'share' : undefined}
      pendingLabel={copy.saving}
      after={
        <section className={styles.inventory} aria-labelledby="inventory-heading">
          <h2 id="inventory-heading" className="type-title">
            {copy.inventory}
          </h2>
          <Stack gap={4}>
            {items.length === 0 ? <p className={styles.note}>{copy.noItems}</p> : null}
            {items.length > 0 ? (
              <InventoryList lettingId={lettingId} items={items} removable={!shared} />
            ) : null}
            {status ? <p>{status}</p> : null}
            {!tenancy.inventoryConfirmedAt ? (
              <div>
                <ButtonLink href={`${tenancyHref}/inventory`} variant="secondary" fullWidth="phone">
                  {copy.addItem}
                </ButtonLink>
              </div>
            ) : null}
          </Stack>
        </section>
      }
    />
  );
}
