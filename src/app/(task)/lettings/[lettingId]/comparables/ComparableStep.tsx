'use client';

import { ExternalLink } from 'lucide-react';
import { propertyTypes } from '@/domain/lettings/new-letting';
import { RTB_RENT_REGISTER_URL } from '@/domain/rent/comparables';
import type { FormState } from '@/lib/forms';
import { ButtonLink, buttonProps } from '@/ui/Button';
import { FieldError, SelectField, TextField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

/**
 * UX-LP-14 (R4, Q41, OQ-2): one comparable home per screen. Gaff can't read the RTB's Rent
 * Register itself, so the person looks one up in a new tab; the area, type and bedrooms start
 * filled in from this home, and they type the rent and, if they have it, the date.
 */
export function ComparableStep({
  action,
  position,
  address,
  start,
  today,
  leaveHref,
  backHref,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  position: number;
  address: string;
  start: Record<string, string>;
  today: string;
  leaveHref: string;
  backHref: string | null;
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action);
  const v = values ?? start;
  return (
    <FlowShell
      leave={{ kind: 'close', href: leaveHref }}
      progress={{
        label: 'Comparable rents',
        segments: ['First home', 'Second home', 'Third home'],
        current: position - 1,
      }}
      form={form}
      back={
        backHref ? (
          <ButtonLink href={backHref} variant="quiet">
            Back
          </ButtonLink>
        ) : undefined
      }
      primary={
        <SubmitButton fullWidth="phone" pendingLabel="Saving…">
          {position < 3 ? 'Next' : 'Save comparables'}
        </SubmitButton>
      }
    >
      <FlowTitle
        title={`Comparable rent ${position} of 3`}
        lead={`A home like ${address} on the RTB’s Rent Register: the same type, a similar size, in the same area. Gaff keeps three for the rent-setting pack.`}
      />
      <FlowProblems count={count} />
      <div>
        <a
          href={RTB_RENT_REGISTER_URL}
          target="_blank"
          rel="noopener noreferrer"
          {...buttonProps('secondary', 'phone')}
        >
          <span>Open the RTB’s Rent Register</span>
          <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
      <TextField
        key={`area-${attempt}`}
        name="area"
        label="Area"
        hint="As shown on the register, like Dublin 6"
        autoComplete="off"
        defaultValue={v.area ?? ''}
        error={errors.area}
      />
      <SelectField
        key={`type-${attempt}`}
        name="propertyType"
        label="Type of home"
        width="medium"
        defaultValue={v.propertyType ?? ''}
        error={errors.propertyType}
        options={[
          { value: '', label: 'Choose…' },
          ...Object.entries(propertyTypes).map(([value, label]) => ({ value, label })),
        ]}
      />
      <TextField
        key={`bedrooms-${attempt}`}
        name="bedrooms"
        label="Bedrooms"
        inputMode="numeric"
        width="short"
        defaultValue={v.bedrooms ?? ''}
        error={errors.bedrooms}
      />
      <TextField
        key={`rent-${attempt}`}
        name="rent"
        label="Rent a month"
        prefix="€"
        inputMode="decimal"
        width="medium"
        defaultValue={v.rent ?? ''}
        error={errors.rent}
      />
      <TextField
        key={`date-${attempt}`}
        name="registeredOn"
        label="Date on the register"
        type="date"
        max={today}
        optional
        width="medium"
        defaultValue={v.registeredOn ?? ''}
        error={errors.registeredOn}
      />
      {errors.form ? <FieldError id="comparable-problem">{errors.form}</FieldError> : null}
    </FlowShell>
  );
}
