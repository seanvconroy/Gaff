'use client';

import { useActionState } from 'react';
import { checksCopy, common } from '@/copy/renter';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { QuestionSteps, type QuestionStep } from '@/ui/QuestionSteps';
import { refereesAction } from './check-actions';

const copy = checksCopy.references;
const anEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Values = Readonly<Record<string, string>>;

const need =
  (field: string, message: string) =>
  (values: Values): Record<string, string> =>
    values[field] ? {} : { [field]: message };

function refereeProblems(prefix: 'landlord' | 'employer', values: Values) {
  const problems: Record<string, string> = {};
  if (!values[`${prefix}Name`]?.trim()) problems[`${prefix}Name`] = copy.problems.name;
  if (!anEmail.test(values[`${prefix}Email`]?.trim() ?? '')) {
    problems[`${prefix}Email`] = copy.problems.email;
  }
  return problems;
}

/**
 * R18, UX-RN-15, UX-RN-18: who Gaff should ask for a reference, one referee per screen. The
 * opt-out is the first question, not a tick after the fields: "Have you rented before?", and
 * "Is there an employer we can ask?". "No" is an answer like any other and loses the renter
 * nothing: the references are done either way.
 */
export function ReferencesFlow({
  token,
  ask,
  startAt,
}: {
  token: string;
  /** Which referees are still to be asked about. */
  ask: ReadonlyArray<'landlord' | 'employer'>;
  startAt?: string | null;
}) {
  const [state, action] = useActionState(refereesAction.bind(null, token), emptyFormState);
  const defaults = state.values ?? {};
  const yesNo = [
    { value: 'yes', label: common.yes },
    { value: 'no', label: common.no },
  ];
  const landlord: QuestionStep[] = [
    {
      id: 'rented',
      name: copy.names.rented,
      title: copy.rented.title,
      fields: ['rented'],
      check: need('rented', copy.problems.rented),
      content: ({ values, errors }) => (
        <>
          <ChoiceGroup
            name="rented"
            legend={copy.rented.title}
            hideLegend
            inline
            defaultValue={defaults.rented}
            error={errors.rented}
            options={yesNo}
          />
          {values.rented === 'no' ? <input type="hidden" name="landlordNone" value="yes" /> : null}
        </>
      ),
    },
    {
      id: 'landlord',
      name: copy.names.landlord,
      title: copy.landlord.title,
      fields: ['landlordName', 'landlordEmail'],
      skip: (values) => values.rented !== 'yes',
      check: (values) => refereeProblems('landlord', values),
      content: ({ errors }) => (
        <>
          <TextField
            name="landlordName"
            label={copy.landlord.name}
            autoComplete="off"
            defaultValue={defaults.landlordName}
            error={errors.landlordName}
          />
          <TextField
            name="landlordEmail"
            label={copy.landlord.email}
            type="email"
            inputMode="email"
            autoComplete="off"
            defaultValue={defaults.landlordEmail}
            error={errors.landlordEmail}
          />
        </>
      ),
    },
  ];
  const employer: QuestionStep[] = [
    {
      id: 'employer',
      name: copy.names.employer,
      title: copy.employer.title,
      fields: ['employer'],
      check: need('employer', copy.problems.employer),
      content: ({ values, errors }) => (
        <>
          <ChoiceGroup
            name="employer"
            legend={copy.employer.title}
            hideLegend
            inline
            defaultValue={defaults.employer}
            error={errors.employer}
            options={yesNo}
          />
          {values.employer === 'no' ? (
            <input type="hidden" name="employerNone" value="yes" />
          ) : null}
        </>
      ),
    },
    {
      id: 'employer-details',
      name: copy.names.manager,
      title: copy.manager.title,
      fields: ['employerName', 'employerEmail'],
      skip: (values) => values.employer !== 'yes',
      check: (values) => refereeProblems('employer', values),
      content: ({ errors }) => (
        <>
          <TextField
            name="employerName"
            label={copy.manager.name}
            autoComplete="off"
            defaultValue={defaults.employerName}
            error={errors.employerName}
          />
          <TextField
            name="employerEmail"
            label={copy.manager.email}
            type="email"
            inputMode="email"
            autoComplete="off"
            defaultValue={defaults.employerEmail}
            error={errors.employerEmail}
          />
        </>
      ),
    },
  ];
  return (
    <QuestionSteps
      label={copy.progress}
      steps={[
        ...(ask.includes('landlord') ? landlord : []),
        ...(ask.includes('employer') ? employer : []),
      ]}
      action={action}
      defaults={defaults}
      serverErrors={state.errors}
      formKey={state.attempt}
      startAt={startAt}
      submit={copy.send}
      pending={copy.sending}
      level={3}
    />
  );
}
