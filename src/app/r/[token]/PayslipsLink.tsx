'use client';

import { useState } from 'react';
import { checksCopy, common } from '@/copy/renter';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';

/**
 * UX-RN-15: "I'd rather send payslips", under the income check. Gaff takes no documents itself
 * yet, so this is the way to a person: the operator arranges it with the renter. It asks for
 * nothing and records nothing.
 */
export function PayslipsLink({ operator }: { operator: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="quiet" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {checksCopy.income.payslips}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={checksCopy.income.payslipsTitle}
        footer={
          <Button variant="quiet" fullWidth="phone" onClick={() => setOpen(false)}>
            {common.done}
          </Button>
        }
      >
        <p>{checksCopy.income.payslipsText(operator)}</p>
      </Sheet>
    </>
  );
}
