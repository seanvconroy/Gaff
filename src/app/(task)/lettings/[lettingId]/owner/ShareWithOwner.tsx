'use client';

import { shareCopy } from '@/copy/owner';
import { firstNameOf } from '@/domain/accounts/first-run';
import type { FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { FieldError, TextField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

const copy = shareCopy;

/**
 * "Share with the owner" (UX-OW-1, UX-OW-2, UX-OW-4; R27), from a letting's menu and from the
 * prompt just after go-live: the owner's name and email, and one button. Gaff emails them a
 * private link to follow the letting; no link is shown here. Once it's shared, the same screen
 * says when they last looked, sends a new link, and stops sharing.
 */
export function ShareWithOwner({
  action,
  address,
  lettingHref,
  owner,
  shared,
  lastOpened,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  address: string;
  lettingHref: string;
  /** The owner Gaff already knows for this home, if any. */
  owner: { name: string; email: string } | null;
  shared: boolean;
  /** When the owner last opened their page, in words. */
  lastOpened: string | null;
}) {
  const { form, errors, count, values, attempt } = useFlowForm(action);
  const done = (
    <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
      {copy.sent.done}
    </ButtonLink>
  );

  // UX-FL-4: the last screen says what was done and what happens next, with one way onwards.
  if (values?.done === 'sent') {
    const first = firstNameOf(values.ownerName ?? '') || 'the owner';
    return (
      <FlowShell leave={{ kind: 'close', href: lettingHref }} primary={done}>
        <Outcome tone="success" title={copy.sent.title(first)} headingLevel={1} role="status">
          <p>{copy.sent.text(first, address)}</p>
          <p>{copy.sent.next(first)}</p>
        </Outcome>
      </FlowShell>
    );
  }
  if (values?.done === 'stopped') {
    return (
      <FlowShell leave={{ kind: 'close', href: lettingHref }} primary={done}>
        <Outcome tone="info" title={copy.stopped.title} headingLevel={1} role="status">
          <p>{copy.stopped.text}</p>
        </Outcome>
      </FlowShell>
    );
  }

  const first = owner ? firstNameOf(owner.name) || owner.name : '';
  return (
    <FlowShell
      leave={{ kind: 'close', href: lettingHref }}
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.sending}>
          {shared ? copy.shared.again : copy.send}
        </SubmitButton>
      }
      form={form}
    >
      <FlowTitle
        title={shared && owner ? copy.shared.title(owner.name) : copy.title}
        lead={
          shared && owner
            ? `${lastOpened ? copy.shared.opened(first, lastOpened) : copy.shared.notOpened(first)} ${copy.shared.replaces}`
            : copy.lead(address)
        }
      />
      <FlowProblems count={count} />
      <TextField
        key={`name-${attempt}`}
        name="ownerName"
        label={copy.name}
        autoComplete="off"
        defaultValue={values?.ownerName ?? owner?.name ?? ''}
        error={errors.ownerName}
      />
      <TextField
        key={`email-${attempt}`}
        name="ownerEmail"
        label={copy.email}
        type="email"
        inputMode="email"
        autoComplete="off"
        defaultValue={values?.ownerEmail ?? owner?.email ?? ''}
        error={errors.ownerEmail}
      />
      {/* UX-DS-18: an action that failed is said where it was pressed. */}
      {errors.form ? <FieldError id="share-problem">{errors.form}</FieldError> : null}
      {shared ? (
        <div>
          <SubmitButton
            name="intent"
            value="stop"
            variant="secondary"
            fullWidth="phone"
            pendingLabel={copy.shared.stopping}
          >
            {copy.shared.stop}
          </SubmitButton>
        </div>
      ) : null}
    </FlowShell>
  );
}
