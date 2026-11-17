'use client';

import { common, questionsCopy } from '@/copy/renter';
import {
  MOVE_IN_LATER,
  MOVE_IN_YES,
  OCCUPANTS_MORE,
  OCCUPANT_BUTTONS,
  readAnswer,
  stayChoices,
} from '@/domain/criteria/answers';
import type { Criteria, CriterionQuestion } from '@/domain/criteria/criteria';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { DateField } from '@/ui/Pickers';
import type { QuestionStep } from '@/ui/QuestionSteps';

/** UX-RN-2: the order the questions are asked in. Only those the criteria need are asked. */
export const QUESTION_ORDER: readonly CriterionQuestion[] = [
  'occupants',
  'hasPets',
  'moveInDate',
  'stayMonths',
];

/**
 * R9, UX-RN-2: the four pre-viewing questions as screens, each answered with taps: the same
 * screens on a renter's own page and when asking to view on Gaff (UX-AV-4), so a question is
 * asked in one way wherever it is asked. A screen only checks that it was answered.
 */
export function criterionSteps({
  criteria,
  moveInBy,
  today,
  defaults,
}: {
  criteria: Criteria;
  /** The date the move-in question asks about, in words. */
  moveInBy: string;
  today: string;
  defaults: Readonly<Record<string, string | undefined>>;
}): Record<CriterionQuestion, QuestionStep> {
  const check = (question: CriterionQuestion) => (values: Readonly<Record<string, string>>) => {
    const read = readAnswer(question, values, criteria);
    return read.ok ? {} : { [read.field]: read.message };
  };
  return {
    occupants: {
      id: 'people',
      name: questionsCopy.names.occupants,
      title: questionsCopy.occupants.title,
      fields: ['occupants', 'occupantsMore'],
      check: check('occupants'),
      content: ({ values, errors }) => (
        <>
          <ChoiceGroup
            name="occupants"
            legend={questionsCopy.occupants.title}
            hideLegend
            inline="pairs"
            defaultValue={defaults.occupants}
            error={errors.occupants}
            options={[
              ...Array.from({ length: OCCUPANT_BUTTONS }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              })),
              { value: OCCUPANTS_MORE, label: questionsCopy.occupants.more },
            ]}
          />
          {values.occupants === OCCUPANTS_MORE ? (
            <TextField
              name="occupantsMore"
              label={questionsCopy.occupants.moreLabel}
              width="short"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={defaults.occupantsMore}
              error={errors.occupantsMore}
            />
          ) : null}
        </>
      ),
    },
    hasPets: {
      id: 'pets',
      name: questionsCopy.names.hasPets,
      title: questionsCopy.hasPets.title,
      fields: ['hasPets'],
      check: check('hasPets'),
      content: ({ errors }) => (
        <ChoiceGroup
          name="hasPets"
          legend={questionsCopy.hasPets.title}
          hideLegend
          hint={questionsCopy.hasPets.hint}
          inline
          defaultValue={defaults.hasPets}
          error={errors.hasPets}
          options={[
            { value: 'yes', label: common.yes },
            { value: 'no', label: common.no },
          ]}
        />
      ),
    },
    moveInDate: {
      id: 'moving-in',
      name: questionsCopy.names.moveInDate,
      title: questionsCopy.moveInDate.title(moveInBy),
      fields: ['canMoveIn', 'moveInDate'],
      check: check('moveInDate'),
      content: ({ values, errors }) => (
        <>
          <ChoiceGroup
            name="canMoveIn"
            legend={questionsCopy.moveInDate.title(moveInBy)}
            hideLegend
            defaultValue={defaults.canMoveIn}
            error={errors.canMoveIn}
            options={[
              { value: MOVE_IN_YES, label: common.yes },
              { value: MOVE_IN_LATER, label: questionsCopy.moveInDate.later },
            ]}
          />
          {values.canMoveIn === MOVE_IN_LATER ? (
            <DateField
              name="moveInDate"
              label={questionsCopy.moveInDate.dateLabel}
              title={questionsCopy.moveInDate.dateTitle}
              min={today}
              defaultValue={defaults.moveInDate}
              error={errors.moveInDate}
            />
          ) : null}
        </>
      ),
    },
    stayMonths: {
      id: 'staying',
      name: questionsCopy.names.stayMonths,
      title: questionsCopy.stayMonths.title,
      fields: ['stayMonths'],
      check: check('stayMonths'),
      content: ({ errors }) => (
        <ChoiceGroup
          name="stayMonths"
          legend={questionsCopy.stayMonths.title}
          hideLegend
          defaultValue={defaults.stayMonths}
          error={errors.stayMonths}
          options={stayChoices.map((choice) => ({
            value: String(choice.months),
            label: choice.label,
          }))}
        />
      ),
    },
  };
}
