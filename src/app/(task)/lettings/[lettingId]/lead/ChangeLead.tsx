'use client';

import { teamCopy } from '@/copy/team';
import { roleLabels, type Role } from '@/domain/team/permissions';
import type { FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { ChoiceGroup } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

const copy = teamCopy.changeLead;

/** UX-AG-9: "Who leads this letting?", one question, with everyone on the team as a choice. */
export function ChangeLead({
  action,
  address,
  lettingHref,
  lead,
  you,
  members,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  address: string;
  lettingHref: string;
  lead: string | null;
  you: string;
  members: Array<{ userId: string; name: string; role: Role }>;
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action);
  if (values?.done === 'changed') {
    return (
      <FlowShell
        leave={{ kind: 'close', href: lettingHref }}
        primary={
          <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
            {copy.done.back}
          </ButtonLink>
        }
      >
        <Outcome
          tone="success"
          title={copy.done.title(values.leadName ?? '')}
          headingLevel={1}
          role="status"
        >
          <p>{copy.done.text(address)}</p>
        </Outcome>
      </FlowShell>
    );
  }
  return (
    <FlowShell
      leave={{ kind: 'close', href: lettingHref }}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.saving}>
          {copy.save}
        </SubmitButton>
      }
      form={form}
    >
      <FlowTitle title={copy.title} lead={copy.lead(address)} />
      <FlowProblems count={count} />
      <ChoiceGroup
        key={`lead-${attempt}`}
        name="lead"
        legend={copy.legend}
        hideLegend
        defaultValue={values?.lead ?? lead ?? undefined}
        error={errors.lead}
        options={members.map((person) => ({
          value: person.userId,
          label: person.userId === you ? copy.you(person.name) : person.name,
          hint: roleLabels[person.role],
        }))}
      />
    </FlowShell>
  );
}
