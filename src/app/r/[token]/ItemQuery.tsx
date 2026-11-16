'use client';

import { useActionState, useState } from 'react';
import { tenancyCopy } from '@/copy/renter';
import { INVENTORY_QUERY_MAX } from '@/domain/tenancy/movein';
import { emptyFormState } from '@/lib/forms';
import { Button } from '@/ui/Button';
import { TextArea } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import { queryItemAction } from './inventory-actions';

const copy = tenancyCopy.inventory;

/**
 * UX-RN-25: "Something's not right", on each item of the inventory. It opens a short note to
 * the lister about that item, and nothing else: no categories, no blame, one box and one button.
 */
export function ItemQuery({
  token,
  itemId,
  item,
  operator,
  note,
}: {
  token: string;
  itemId: string;
  /** "Fridge" */
  item: string;
  operator: string;
  /** What they've already said about it, to change. */
  note: string | null;
}) {
  const [state, action] = useActionState(queryItemAction.bind(null, token, itemId), emptyFormState);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<number | undefined>();
  // The note went: the sheet closes, and the page under it now shows what was said.
  if (state.message === 'sent' && state.attempt !== sent) {
    setSent(state.attempt);
    setOpen(false);
  }
  return (
    <>
      <Button variant="quiet" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {copy.wrong}
        <span className="visually-hidden">: {item}</span>
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.sheetTitle(item)}>
        <form key={state.attempt ?? 'first'} action={action} noValidate className={styles.task}>
          <TextArea
            name="note"
            label={copy.noteLabel}
            hint={copy.noteHint(operator)}
            rows={4}
            maxLength={INVENTORY_QUERY_MAX}
            defaultValue={state.values?.note ?? note ?? ''}
            error={state.errors?.note}
          />
          <div className={styles.actions}>
            <SubmitButton fullWidth="phone" pendingLabel={copy.sending}>
              {copy.send(operator)}
            </SubmitButton>
            <Button variant="quiet" fullWidth="phone" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
