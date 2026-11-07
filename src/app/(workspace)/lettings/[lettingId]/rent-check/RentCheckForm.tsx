'use client';

import { useActionState } from 'react';
import { endings } from '@/domain/rent/rent-check';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Columns, FormActions, FormPanel, FormSection, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../letting.module.css';
import { rentCheckAction } from './actions';

/**
 * R3. Only the questions that apply show (progressive disclosure, with no script): nothing more
 * for a first letting; how it ended and the last rent for a home let before; and whether it's
 * been changed only if the last tenancy began before the new rules.
 */
export function RentCheckForm({
  lettingId,
  today,
  current,
}: {
  lettingId: string;
  today: string;
  current: Record<string, string>;
}) {
  const [state, action] = useActionState(rentCheckAction.bind(null, lettingId), emptyFormState);
  const v = state.values ?? current;
  const e = state.errors ?? {};
  return (
    <form
      key={state.attempt ?? 'first'}
      action={action}
      className={`${formClass} ${styles.rentForm}`}
      noValidate
    >
      {e.form ? (
        <Notice tone="danger" role="alert">
          <p>{e.form}</p>
        </Notice>
      ) : null}
      <FormPanel>
        <FormSection id="last-tenancy" title="The last tenancy" variant="plain">
          <ChoiceGroup
            name="lastLet"
            legend="Has this home been let before?"
            defaultValue={v.lastLet}
            error={e.lastLet}
            options={[
              { value: 'never', label: 'No, this is its first letting' },
              {
                value: 'before_new_rules',
                label: 'Yes, and the last tenancy began before 1 March 2026',
              },
              {
                value: 'under_new_rules',
                label: 'Yes, and the last tenancy began on or after 1 March 2026',
              },
            ]}
          />
          <div className={styles.ifLetBefore}>
            <ChoiceGroup
              name="ending"
              legend="How did the last tenancy end?"
              defaultValue={v.ending}
              error={e.ending}
              options={Object.entries(endings).map(([value, label]) => ({ value, label }))}
            />
            <div className={styles.ifBeforeNewRules}>
              <ChoiceGroup
                name="substantialChange"
                legend="Has the home been substantially refurbished or changed since then?"
                inline
                defaultValue={v.substantialChange}
                error={e.substantialChange}
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ]}
              />
            </div>
            <Columns>
              <TextField
                name="previousRent"
                label="Last rent a month"
                prefix="€"
                inputMode="decimal"
                defaultValue={v.previousRent}
                error={e.previousRent}
              />
              <TextField
                name="previousRentSetOn"
                label="Date that rent was set"
                type="date"
                max={today}
                defaultValue={v.previousRentSetOn}
                error={e.previousRentSetOn}
              />
            </Columns>
          </div>
        </FormSection>
        <FormSection id="asking" title="The new rent" variant="plain">
          <TextField
            name="askingRent"
            label="Rent you’re asking a month"
            hint="As on the advert. If the check says it’s too high, change it here and on the advert."
            prefix="€"
            width="medium"
            inputMode="decimal"
            defaultValue={v.askingRent}
            error={e.askingRent}
          />
        </FormSection>
      </FormPanel>
      <FormActions>
        <SubmitButton pendingLabel="Checking…">Check the rent</SubmitButton>
      </FormActions>
    </form>
  );
}
