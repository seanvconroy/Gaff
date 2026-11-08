'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import {
  accessibilityFeatures,
  appliances,
  broadbandTypes,
  heatingTypes,
  outdoorSpaces,
} from '@/domain/homes/facts';
import { checkListingText } from '@/domain/moderation/listing-text';
import { emptyFormState, type FormState } from '@/lib/forms';
import { Button } from '@/ui/Button';
import { ChoiceGroup, SelectField, TextArea, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { DraftedByAi } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import {
  descriptionAction,
  draftDescriptionAction,
  homeDetailsAction,
  lettingDetailsAction,
  publishAction,
} from './actions';
import styles from './listing.module.css';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
const options = (o: Record<string, string>, blank?: string) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...Object.entries(o).map(([value, label]) => ({ value, label })),
];

function Saved({ state }: { state: FormState }) {
  return state.message === 'saved' ? (
    <p role="status" className={styles.saved}>
      Saved.
    </p>
  ) : null;
}

/** M38 to M40: the facts about the home. */
export function HomeDetailsForm({
  lettingId,
  initial,
}: {
  lettingId: string;
  initial: Record<string, string>;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    homeDetailsAction.bind(null, lettingId) as Action,
    emptyFormState,
  );
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        <ChoiceGroup
          name="showExactAddress"
          legend="How much of the address can renters see?"
          defaultValue={v.showExactAddress ?? 'yes'}
          error={e.showExactAddress}
          options={[
            { value: 'yes', label: 'The full address' },
            {
              value: 'no',
              label: 'Only the street and area',
              hint: 'The map shows roughly where it is.',
            },
          ]}
        />
        <div className={styles.grid}>
          <SelectField
            name="heating"
            label="Heating"
            defaultValue={v.heating}
            error={e.heating}
            options={options(heatingTypes, 'Choose the heating')}
          />
          <SelectField
            name="outdoorSpace"
            label="Outdoor space"
            defaultValue={v.outdoorSpace}
            error={e.outdoorSpace}
            options={options(outdoorSpaces, 'Choose the outdoor space')}
          />
          <TextField
            name="floorAreaSqm"
            label="Floor area in square metres"
            optional
            inputMode="numeric"
            defaultValue={v.floorAreaSqm}
            error={e.floorAreaSqm}
          />
          <TextField
            name="floor"
            label="Floor"
            hint="0 for the ground floor"
            optional
            inputMode="numeric"
            defaultValue={v.floor}
            error={e.floor}
          />
          <SelectField
            name="hasLift"
            label="Lift"
            optional
            defaultValue={v.hasLift}
            error={e.hasLift}
            options={[
              { value: '', label: 'Not saying' },
              { value: 'yes', label: 'There’s a lift' },
              { value: 'no', label: 'No lift' },
            ]}
          />
          <TextField
            name="ensuites"
            label="En-suites"
            optional
            inputMode="numeric"
            defaultValue={v.ensuites}
            error={e.ensuites}
          />
          <SelectField
            name="broadband"
            label="Broadband"
            optional
            defaultValue={v.broadband}
            error={e.broadband}
            options={options(broadbandTypes, 'Not saying')}
          />
        </div>
        <ChoiceGroup
          name="accessibility"
          type="checkbox"
          legend="Accessibility (optional)"
          defaultValue={v.accessibility?.split(',')}
          options={options(accessibilityFeatures)}
        />
        <ChoiceGroup
          name="appliances"
          type="checkbox"
          legend="Appliances (optional)"
          defaultValue={v.appliances?.split(',')}
          options={options(appliances)}
        />
        <div className={styles.grid}>
          <TextField
            name="berNumber"
            label="BER number"
            hint="9 digits, from the certificate"
            optional
            inputMode="numeric"
            defaultValue={v.berNumber}
            error={e.berNumber}
          />
          <TextField
            name="berCertificateDate"
            label="Date the BER certificate was issued"
            hint="It decides which BER scale renters see"
            optional
            type="date"
            defaultValue={v.berCertificateDate}
            error={e.berCertificateDate}
          />
        </div>
        <Saved state={state} />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save the home’s details
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}

/** M39, M44, M52: deposit, tour and enquiries. */
export function LettingDetailsForm({
  lettingId,
  initial,
}: {
  lettingId: string;
  initial: Record<string, string>;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    lettingDetailsAction.bind(null, lettingId) as Action,
    emptyFormState,
  );
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        <div className={styles.grid}>
          <TextField
            name="deposit"
            label="Deposit"
            prefix="€"
            hint="Up to one month’s rent, by law. Enter 0 for none."
            inputMode="decimal"
            defaultValue={v.deposit}
            error={e.deposit}
          />
          <TextField
            name="tourUrl"
            label="Video or virtual tour"
            hint="A YouTube, Vimeo or Matterport link"
            optional
            type="url"
            defaultValue={v.tourUrl}
            error={e.tourUrl}
          />
          <TextField
            name="enquiryLimit"
            label="Close enquiries after"
            hint="A number of enquiries, the same for everyone"
            optional
            inputMode="numeric"
            defaultValue={v.enquiryLimit}
            error={e.enquiryLimit}
          />
          <TextField
            name="enquiriesCloseAt"
            label="Or close enquiries at"
            optional
            type="datetime-local"
            defaultValue={v.enquiriesCloseAt}
            error={e.enquiriesCloseAt}
          />
        </div>
        <Saved state={state} />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save the price and enquiries
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}

/**
 * M45, M46: the description, checked as the letter types. P10, P11: the AI can draft one from
 * the facts; it stays marked as drafted by AI until the letter changes it, and only the letter
 * saves it.
 */
export function DescriptionForm({
  lettingId,
  initial,
  initialFromAi,
}: {
  lettingId: string;
  initial: string;
  /** The saved description is the AI's draft, unchanged. */
  initialFromAi: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    descriptionAction.bind(null, lettingId) as Action,
    emptyFormState,
  );
  const [text, setText] = useState(state.values?.description ?? initial);
  const [draft, setDraft] = useState<string | null>(
    state.values?.drafted ?? (initialFromAi ? initial : null),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [drafting, startDrafting] = useTransition();
  const findings = useMemo(() => checkListingText(text), [text]);
  const fromAi = draft !== null && draft.trim() === text.trim();

  function draftOne() {
    setProblem(null);
    startDrafting(async () => {
      const result = await draftDescriptionAction(lettingId);
      if (result.ok) {
        setText(result.description);
        setDraft(result.description);
      } else {
        setProblem(result.message);
      }
    });
  }

  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={4}>
        <div className={styles.descriptionHead}>
          {fromAi ? <DraftedByAi /> : null}
          <Button variant="quiet" onClick={draftOne} disabled={drafting} aria-busy={drafting}>
            {drafting
              ? 'Drafting…'
              : text.trim()
                ? 'Draft a new description'
                : 'Draft a description'}
          </Button>
        </div>
        {problem ? (
          <Notice tone="warning" role="alert">
            <p>{problem}</p>
          </Notice>
        ) : null}
        <TextArea
          name="description"
          label="Describe the home"
          hint="What it’s like to live in, and what’s nearby. Renters see your criteria, the cost to move in and the facts separately. No phone numbers or links: renters enquire through Gaff. Gaff can draft one from the facts you’ve entered, for you to check and change."
          rows={8}
          maxLength={4000}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          error={state.errors?.description}
        />
        {draft !== null ? <input type="hidden" name="drafted" value={draft} /> : null}
        <p className={styles.count}>{text.trim().length} of 4,000 characters</p>
        {fromAi ? (
          <p className={styles.count}>
            Drafted by AI from the facts you entered. Read it through and change anything that isn’t
            right: renters see it only when you save and publish.
          </p>
        ) : null}
        {findings.length > 0 ? (
          <Notice tone="warning" role="status" title="Before this can go live">
            <ul>
              {findings.map((f) => (
                <li key={`${f.kind}-${f.phrase}`}>{f.message}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <Saved state={state} />
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save the description
          </SubmitButton>
        </div>
      </Stack>
    </form>
  );
}

/** M25, M48: the declaration, then publish. */
export function PublishForm({
  lettingId,
  declared,
  declaration,
  blocked,
}: {
  lettingId: string;
  declared: boolean;
  declaration: string;
  blocked: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    publishAction.bind(null, lettingId) as Action,
    emptyFormState,
  );
  return (
    <form action={action}>
      <Stack gap={4}>
        {state.message === 'held' ? (
          <Notice tone="info" role="status" title="A person at Gaff is checking it">
            <p>
              We check some listings before they go live. We’ll email you within 4 working hours.
            </p>
          </Notice>
        ) : null}
        {state.message === 'problems' ? (
          <Notice tone="warning" role="alert">
            <p>There’s still something to do: see the list at the top of this page.</p>
          </Notice>
        ) : null}
        {!declared ? (
          <ChoiceGroup
            name="declare"
            type="checkbox"
            legend="Before it goes live"
            options={[{ value: 'yes', label: declaration }]}
          />
        ) : null}
        {blocked ? (
          <p>It’s with a person at Gaff now. We’ll email you within 4 working hours.</p>
        ) : (
          <div>
            <SubmitButton pendingLabel="Publishing…">Publish this listing</SubmitButton>
          </div>
        )}
      </Stack>
    </form>
  );
}
