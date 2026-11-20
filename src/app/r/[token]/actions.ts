'use server';

import { common } from '@/copy/renter';
import { formValues, invalid, type FormState } from '@/lib/forms';
import { saveRenterAnswers } from '@/server/renter/answers';
import { toRenterPage } from './back';
import { keepFromPage } from './keep';

/** R9, UX-RN-2: the renter sends their answers. Whatever they are, the next page is "Thanks". */
export async function saveAnswersAction(
  token: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const result = await saveRenterAnswers(token, values);
  if (!result) return invalid({ form: common.linkEnded }, values);
  if (!result.ok) {
    if ('locked' in result) toRenterPage(token);
    return invalid(result.errors, values);
  }
  // UX-PF-2: their answers are kept, for a renter whose profile keeps what they enter.
  // UX-PF-3: kept answers that were offered back are recorded as confirmed, as income is.
  await keepFromPage(
    token,
    'answers',
    (entered) => ({ answers: entered.answers }),
    values.offered === 'answers' ? 'answers' : undefined,
  );
  toRenterPage(token);
}
