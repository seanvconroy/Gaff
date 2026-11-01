'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { TextField } from '@/ui/Field';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { ppsnAction } from './ppsn-actions';

/**
 * R24 (Q24): optional, for RTB registration only, and deleted once that's done. Never a date of
 * birth (rule 3).
 */
export function PpsnForm({
  token,
  operatorName,
  given,
}: {
  token: string;
  operatorName: string;
  given: boolean;
}) {
  const [state, action] = useActionState(ppsnAction.bind(null, token), emptyFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <Card>
      <Stack gap={4}>
        <h2 className="type-title">Your PPS number, for the RTB</h2>
        <p>
          {operatorName} registers your tenancy with the Residential Tenancies Board. The RTB
          recommends including your PPS number, but you don’t have to give it. It’s used only for
          that, and deleted once the tenancy is registered.
        </p>
        {given ? (
          <>
            <p>You’ve given your PPS number. Thank you.</p>
            <form action={action}>
              <input type="hidden" name="ppsn" value="" />
              <SubmitButton variant="secondary" pendingLabel="Removing…">
                Remove my PPS number
              </SubmitButton>
            </form>
          </>
        ) : (
          <form key={state.attempt ?? 'first'} action={action} noValidate>
            <Stack gap={4}>
              {state.message ? (
                <Notice tone="danger" role="alert">
                  <p>{state.message}</p>
                </Notice>
              ) : null}
              <TextField
                name="ppsn"
                label="PPS number"
                hint="Seven numbers and one or two letters, like 1234567T."
                optional
                autoComplete="off"
                defaultValue={v.ppsn}
                error={e.ppsn}
              />
              <div>
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Give my PPS number
                </SubmitButton>
              </div>
            </Stack>
          </form>
        )}
      </Stack>
    </Card>
  );
}
