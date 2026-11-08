import { MAX_OCCUPANTS_ANSWER, stayChoices } from '@/domain/criteria/answers';
import type { CriterionQuestion } from '@/domain/criteria/criteria';
import { ChoiceGroup, SelectField, TextField } from '@/ui/Field';

/**
 * R9, M76: the pre-viewing questions, only those the letter's criteria need, in the same words
 * wherever they're asked: the renter's private page and the enquiry sheet.
 */
export function CriteriaQuestions({
  questions,
  availableFrom,
  today,
  values,
  errors,
}: {
  questions: readonly CriterionQuestion[];
  availableFrom: string;
  today: string;
  values: Record<string, string | undefined>;
  errors: Record<string, string>;
}) {
  return (
    <>
      {questions.includes('moveInDate') ? (
        <TextField
          name="moveInDate"
          label="When could you move in?"
          hint={`The home is available from ${availableFrom}.`}
          type="date"
          min={today}
          defaultValue={values.moveInDate}
          error={errors.moveInDate}
        />
      ) : null}
      {questions.includes('stayMonths') ? (
        <ChoiceGroup
          name="stayMonths"
          legend="How long would you like to stay?"
          defaultValue={values.stayMonths}
          error={errors.stayMonths}
          options={stayChoices.map((c) => ({ value: String(c.months), label: c.label }))}
        />
      ) : null}
      {questions.includes('occupants') ? (
        <SelectField
          name="occupants"
          label="How many people would live in the home, including you?"
          hint="Just the number. We don’t ask who they are."
          defaultValue={values.occupants ?? ''}
          error={errors.occupants}
          options={[
            { value: '', label: 'Choose…' },
            ...Array.from({ length: MAX_OCCUPANTS_ANSWER }, (_, i) => ({
              value: String(i + 1),
              label: i === 0 ? 'Just me' : `${i + 1} people`,
            })),
          ]}
        />
      ) : null}
      {questions.includes('hasPets') ? (
        <ChoiceGroup
          name="hasPets"
          legend="Do you have any pets?"
          hint="Assistance dogs don’t count as pets."
          inline
          defaultValue={values.hasPets}
          error={errors.hasPets}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
        />
      ) : null}
    </>
  );
}
