'use client';

import { CircleCheck, CircleMinus, CircleAlert } from 'lucide-react';
import { tenancyCopy } from '@/copy/tenancy-steps';
import { conditionChoices, conditions } from '@/domain/tenancy/movein';
import type { FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { ChoiceCards } from '@/ui/ChoiceCards';
import { FieldError, TextArea, TextField } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Notice } from '@/ui/Notice';
import { PhotoField } from '@/ui/PhotoField';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';

const copy = tenancyCopy.item;

/** UX-TN-4: each condition has its own icon, and its words; never colour alone. */
const icons = { good: CircleCheck, fair: CircleMinus, poor: CircleAlert } as const;

/**
 * UX-TN-4 (R25): the inventory, one item at a time. Room, item, and its condition as three
 * taps (Good, Fair, Poor), an optional note and a photo. Once it's added the screen opens again,
 * empty but for the room, ready for the next item; "Done" goes back to handing over the keys.
 */
export function ItemStep({
  action,
  leaveHref,
  doneHref,
  count,
  lastRoom,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  leaveHref: string;
  doneHref: string;
  /** Items in the inventory now. */
  count: number;
  lastRoom: string;
}) {
  const { form, errors, count: problems, values, attempt } = useFlowForm(action);
  const added = values?.added;
  const v = added ? { room: values?.room ?? '' } : (values ?? {});
  return (
    <FlowShell
      leave={{ kind: 'back', href: leaveHref }}
      form={form}
      back={
        <ButtonLink href={doneHref} variant="quiet">
          {copy.back}
        </ButtonLink>
      }
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.adding}>
          {copy.button}
        </SubmitButton>
      }
    >
      <FlowTitle title={copy.title} lead={copy.lead} />
      <FlowProblems count={problems} />
      {added ? (
        <Notice tone="success" role="status">
          <p>{copy.added(added, count)}</p>
        </Notice>
      ) : null}
      <TextField
        key={`room-${attempt}`}
        name="room"
        label={copy.room}
        hint={copy.roomHint}
        autoComplete="off"
        width="medium"
        defaultValue={v.room ?? lastRoom}
        error={errors.room}
      />
      <TextField
        key={`item-${attempt}`}
        name="item"
        label={copy.item}
        hint={copy.itemHint}
        autoComplete="off"
        width="medium"
        defaultValue={v.item ?? ''}
        error={errors.item}
      />
      <ChoiceCards
        key={`condition-${attempt}`}
        name="condition"
        legend={copy.condition}
        defaultValue={v.condition}
        error={errors.condition}
        options={conditionChoices.map((value) => ({
          value,
          label: conditions[value],
          help: copy.conditionHelp[value],
          icon: icons[value],
        }))}
      />
      <TextArea
        key={`note-${attempt}`}
        name="note"
        label={copy.note}
        optional
        rows={2}
        defaultValue={v.note ?? ''}
        error={errors.note}
      />
      <PhotoField
        key={`photo-${attempt}`}
        name="photo"
        label={copy.photo}
        hint={copy.photoHint}
        error={errors.photo}
      />
      {errors.form ? <FieldError id="item-problem">{errors.form}</FieldError> : null}
    </FlowShell>
  );
}
