'use client';

import { renterDocumentsCopy } from '@/copy/documents';
import { common } from '@/copy/renter';
import { ChoiceGroup, FieldError } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import { useSend } from '@/ui/useSend';
import { shareAction } from './document-actions';

const copy = renterDocumentsCopy.share;

/**
 * P39, P40: "Share with Halcyon Lettings", and the one tick, off by default, for keeping the
 * documents for a next application. Offered only to someone signed in as themselves, who has a
 * profile to keep them on.
 */
export function ShareForm({
  token,
  operator,
  canKeep,
}: {
  token: string;
  operator: string;
  canKeep: boolean;
}) {
  const [state, action] = useSend(shareAction.bind(null, token), common.sendFailed);
  return (
    <form action={action} noValidate>
      <Stack gap={4}>
        {canKeep ? (
          <ChoiceGroup
            name="keep"
            type="checkbox"
            legend={copy.keep}
            hideLegend
            hint={copy.keepHint}
            options={[{ value: 'yes', label: copy.keep }]}
          />
        ) : null}
        {state.errors?.form ? <FieldError id="share-form">{state.errors.form}</FieldError> : null}
        <div>
          <SubmitButton fullWidth="phone" pendingLabel={copy.sharing}>
            {copy.button(operator)}
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}
