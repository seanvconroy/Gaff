'use client';

import { useRef } from 'react';
import { promptCopy } from '@/copy/activation';
import { teamCopy } from '@/copy/team';
import { inviteEmailsProblem, parseInviteEmails } from '@/domain/team/members';
import type { FormState } from '@/lib/forms';
import { Button, ButtonLink } from '@/ui/Button';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

const copy = teamCopy.inviteFlow;
const TEAM = '/settings/team';

/**
 * UX-AG-11, step 1 of "Inviting people": one field that takes several emails, typed or pasted,
 * and the role, Agent unless Admin is chosen. "Send invites" is the one primary action. The last
 * screen says what was sent and what happens next; Team then lists each invite (step 2).
 */
export function InviteYourTeam({
  action,
  organisationName,
  leaveTo = TEAM,
  offerJustMe = false,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  organisationName: string;
  /** Where closing it, or finishing, goes: Team, or Today. */
  leaveTo?: string;
  /** UX-GR-1: opened from Today's checklist or prompt, it offers "It's just me". */
  offerJustMe?: boolean;
}) {
  // "It's just me" asks for no address, so it is never held up by the field's rule.
  const justMe = useRef(false);
  /** The same rule the server uses: every address is one, and there's at least one. */
  const check = (values: Record<string, string>): Record<string, string> => {
    if (justMe.current) return {};
    const problem = inviteEmailsProblem(parseInviteEmails(values.emails ?? ''));
    return problem ? { emails: problem } : {};
  };
  const { form, errors, count, values, attempt } = useFlowForm(action, check);

  if (values?.done === 'sent') {
    const invited = Number(values.invited ?? 0);
    const already = (values.alreadyIn ?? '').split(', ').filter(Boolean);
    return (
      <FlowShell
        leave={{ kind: 'close', href: leaveTo }}
        primary={
          <ButtonLink href={leaveTo} variant="primary" fullWidth="phone">
            {leaveTo === TEAM ? copy.sent.done : copy.sent.doneToday}
          </ButtonLink>
        }
      >
        <Outcome
          tone={invited > 0 ? 'success' : 'info'}
          title={invited > 0 ? copy.sent.title(invited) : copy.sent.noneNew}
          headingLevel={1}
          role="status"
        >
          {invited > 0 ? <p>{copy.sent.text(organisationName)}</p> : null}
          {already.length > 0 && invited > 0 ? <p>{copy.sent.already(already)}</p> : null}
          {invited > 0 ? <p>{copy.sent.next}</p> : null}
        </Outcome>
      </FlowShell>
    );
  }

  return (
    <FlowShell
      leave={{ kind: 'close', href: leaveTo }}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.sending}>
          {copy.send}
        </SubmitButton>
      }
      form={form}
    >
      <FlowTitle title={copy.title} lead={copy.lead(organisationName)} />
      <FlowProblems count={count} />
      <TextField
        key={`emails-${attempt}`}
        name="emails"
        label={copy.emails}
        hint={copy.emailsHint}
        type="text"
        inputMode="email"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        defaultValue={values?.emails ?? ''}
        error={errors.emails}
      />
      <ChoiceGroup
        key={`role-${attempt}`}
        name="role"
        legend={copy.role}
        defaultValue={values?.role ?? 'negotiator'}
        error={errors.role}
        options={(['negotiator', 'admin'] as const).map((role) => ({
          value: role,
          label: copy.roles[role].label,
          hint: copy.roles[role].hint,
        }))}
      />
      {offerJustMe ? (
        <div>
          <Button
            type="submit"
            name="intent"
            value="just_me"
            variant="quiet"
            onClick={() => {
              justMe.current = true;
            }}
          >
            {promptCopy.justMe}
          </Button>
        </div>
      ) : null}
    </FlowShell>
  );
}
