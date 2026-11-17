'use client';

import type { ReactNode } from 'react';
import type { FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { Disclosure } from '@/ui/Disclosure';
import { ChoiceGroup, FieldError, TextField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

export interface TextSpec {
  kind: 'text';
  name: string;
  label: string;
  hint?: string;
  type?: 'text' | 'email' | 'tel' | 'date';
  width?: 'short' | 'medium';
  optional?: boolean;
  defaultValue?: string;
  min?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal';
}

export interface ChoiceSpec {
  kind: 'choice';
  name: string;
  legend: string;
  type: 'radio' | 'checkbox';
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string | readonly string[];
  hideLegend?: boolean;
}

export type FieldSpec = TextSpec | ChoiceSpec;

/**
 * UX-TN-1, UX-FL-1 to UX-FL-3: one tenancy step's screen. The step's title and what it's for,
 * anything to read (`children`), its few fields, and one primary button in the fixed footer.
 * Errors appear at the field, and a problem with the step itself under what was pressed.
 *
 * `alternative` is the quieter way to do the same step ("We signed on paper"), behind a link.
 */
export function StepForm({
  action,
  leave,
  title,
  lead,
  fields = [],
  primary,
  pendingLabel,
  primaryIntent,
  back,
  alternative,
  after,
  children,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  leave: { kind: 'close' | 'back'; href: string; label?: string };
  title: string;
  lead?: string;
  fields?: readonly FieldSpec[];
  primary: string;
  pendingLabel: string;
  /** Sent as `intent` with the primary button. */
  primaryIntent?: string;
  back?: { href: string; label: string };
  alternative?: { summary: string; text: string; button: string; intent: string };
  after?: ReactNode;
  children?: ReactNode;
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action);
  return (
    <FlowShell
      leave={leave}
      form={form}
      back={
        back ? (
          <ButtonLink href={back.href} variant="quiet">
            {back.label}
          </ButtonLink>
        ) : undefined
      }
      primary={
        <SubmitButton
          fullWidth="phone"
          pendingLabel={pendingLabel}
          name={primaryIntent ? 'intent' : undefined}
          value={primaryIntent}
        >
          {primary}
        </SubmitButton>
      }
    >
      <FlowTitle title={title} lead={lead} />
      <FlowProblems count={count} />
      <Stack gap={6}>
        {children}
        {fields.map((field) =>
          field.kind === 'text' ? (
            <TextField
              key={`${field.name}-${attempt}`}
              name={field.name}
              label={field.label}
              hint={field.hint}
              type={field.type ?? 'text'}
              width={field.width}
              optional={field.optional}
              min={field.min}
              autoComplete={field.autoComplete ?? 'off'}
              inputMode={field.inputMode}
              defaultValue={values?.[field.name] ?? field.defaultValue ?? ''}
              error={errors[field.name]}
            />
          ) : (
            <ChoiceGroup
              key={`${field.name}-${attempt}`}
              name={field.name}
              legend={field.legend}
              type={field.type}
              hideLegend={field.hideLegend}
              options={field.options}
              defaultValue={
                values?.[field.name] !== undefined
                  ? values[field.name]!.split(',')
                  : field.defaultValue
              }
              error={errors[field.name]}
            />
          ),
        )}
        {after}
        {alternative ? (
          <Disclosure summary={alternative.summary}>
            <Stack gap={4}>
              <p>{alternative.text}</p>
              <div>
                <SubmitButton
                  variant="secondary"
                  fullWidth="phone"
                  name="intent"
                  value={alternative.intent}
                  pendingLabel="Saving…"
                >
                  {alternative.button}
                </SubmitButton>
              </div>
            </Stack>
          </Disclosure>
        ) : null}
        {/* UX-DS-18: an action that failed is said where it was pressed. */}
        {errors.form ? <FieldError id="step-problem">{errors.form}</FieldError> : null}
      </Stack>
    </FlowShell>
  );
}
