'use client';

import { useState } from 'react';
import { ConfirmItsYou } from '@/app/(auth)/confirm/ConfirmItsYou';
import { teamCopy } from '@/copy/team';
import { firstNameOf } from '@/domain/accounts/first-run';
import type { FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { FieldError, SelectField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

const copy = teamCopy.remove;
const TEAM = '/settings/team';

/**
 * UX-AG-15, steps 1 to 3 of "When an agent leaves": the admin confirms it's them; if the person
 * leads open lettings, each is listed with a new lead pre-selected (the admin), to change before
 * confirming. The last screen says what happened and what happens next.
 */
export function RemoveMember({
  action,
  name,
  organisationName,
  lettings,
  others,
  you,
  email,
  hasPasskey,
  back,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  name: string;
  organisationName: string;
  lettings: Array<{ lettingId: string; address: string }>;
  /** Who could take a letting on: everyone else on the team. */
  others: Array<{ userId: string; name: string }>;
  /** The admin removing them, the default new lead. */
  you: string;
  /** The admin's own email: where a confirmation code goes. */
  email: string;
  hasPasskey: boolean;
  /** Where Close goes: the member's page. */
  back: string;
}) {
  const { form, errors, count, values, attempt, state } = useFlowForm(action);
  const [closedFor, setClosedFor] = useState<number | undefined>(undefined);
  const first = firstNameOf(name) || name;

  if (values?.done === 'removed') {
    return (
      <FlowShell
        leave={{ kind: 'close', href: TEAM }}
        primary={
          <ButtonLink href={TEAM} variant="primary" fullWidth="phone">
            {copy.done.back}
          </ButtonLink>
        }
      >
        <Outcome tone="success" title={copy.done.title(name)} headingLevel={1} role="status">
          <p>{copy.done.text(first, Number(values.handedOver ?? 0))}</p>
          <p>{copy.done.next}</p>
        </Outcome>
      </FlowShell>
    );
  }

  const options = others.map((person) => ({
    value: person.userId,
    label: person.userId === you ? copy.you(person.name) : person.name,
  }));
  return (
    <>
      <FlowShell
        leave={{ kind: 'close', href: back }}
        primary={
          <SubmitButton variant="primary" fullWidth="phone" pendingLabel={copy.removing}>
            {copy.confirm(first)}
          </SubmitButton>
        }
        form={form}
      >
        <FlowTitle title={copy.title(name, organisationName)} lead={copy.lead} />
        <FlowProblems count={count} />
        {lettings.length > 0 ? (
          <>
            <div>
              <h2 className="type-title">{copy.handover(first)}</h2>
              <p>{copy.handoverLead}</p>
            </div>
            {lettings.map((letting) => (
              <SelectField
                key={`${letting.lettingId}-${attempt}`}
                name={`lead-${letting.lettingId}`}
                label={copy.newLead(letting.address)}
                defaultValue={values?.[`lead-${letting.lettingId}`] ?? you}
                options={options}
              />
            ))}
          </>
        ) : (
          <p>{copy.nothingLed(first)}</p>
        )}
        {errors.form ? <FieldError id="remove-problem">{errors.form}</FieldError> : null}
      </FlowShell>
      <ConfirmItsYou
        key={`confirm-${state.attempt ?? 'first'}`}
        open={state.confirm === 'remove_member' && closedFor !== state.attempt}
        action="remove_member"
        email={email}
        hasPasskey={hasPasskey}
        onClose={() => setClosedFor(state.attempt)}
        onConfirmed={() => {
          setClosedFor(state.attempt);
          form.ref.current?.requestSubmit();
        }}
      />
    </>
  );
}
