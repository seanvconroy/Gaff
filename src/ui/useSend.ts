'use client';

import { unstable_rethrow } from 'next/navigation';
import { useActionState } from 'react';
import { emptyFormState, formValues, invalid, type FormState } from '@/lib/forms';

/**
 * A form's server action, with the state for a send that failed (section 8, "Errors": "An action
 * failed"). If the request never arrives, or the answer never comes back, the form is told so as
 * an error on one of its fields (`form`, unless a field is named), to show at the button or the
 * field: "That didn't send. Check your connection and try again." What was entered is kept.
 *
 * It is `useActionState` otherwise: the same state, the same action for the form.
 */
export function useSend(
  action: (state: FormState, formData: FormData) => Promise<FormState>,
  /** What to say when it didn't send. */
  failed: string,
  /** The field the message is shown at. */
  field = 'form',
) {
  return useActionState(async (state: FormState, formData: FormData): Promise<FormState> => {
    try {
      return await action(state, formData);
    } catch (error) {
      // An action that worked and moves on to another page ends this way too: let it.
      unstable_rethrow(error);
      return invalid({ [field]: failed }, formValues(formData));
    }
  }, emptyFormState);
}
