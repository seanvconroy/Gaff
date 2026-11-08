'use client';

import { useActionState } from 'react';
import { emptyFormState } from '@/lib/forms';
import { ChoiceGroup, TextField } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from './referees.module.css';
import { refereesAction } from './check-actions';

/**
 * R18: who Gaff should ask for a reference. Each can be "I don't have one", and ticking it puts
 * that referee's fields away (progressive disclosure, with no script).
 */
export function RefereesForm({
  token,
  askLandlord,
  askEmployer,
  primary,
}: {
  token: string;
  askLandlord: boolean;
  askEmployer: boolean;
  primary: boolean;
}) {
  const [state, action] = useActionState(refereesAction.bind(null, token), emptyFormState);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate>
      <Stack gap={6}>
        {state.message ? (
          <Notice tone="danger" role="alert">
            <p>{state.message}</p>
          </Notice>
        ) : null}
        {askLandlord ? (
          <fieldset className={styles.referee}>
            <legend className={styles.legend}>Your last landlord</legend>
            <div className={styles.fields}>
              <TextField
                name="landlordName"
                label="Your last landlord’s name"
                autoComplete="off"
                defaultValue={v.landlordName}
                error={e.landlordName}
              />
              <TextField
                name="landlordEmail"
                label="Your last landlord’s email"
                type="email"
                autoComplete="off"
                defaultValue={v.landlordEmail}
                error={e.landlordEmail}
              />
            </div>
            <ChoiceGroup
              name="landlordNone"
              legend="If you haven’t rented before"
              hideLegend
              type="checkbox"
              defaultValue={v.landlordNone}
              options={[{ value: 'yes', label: 'I haven’t rented before' }]}
            />
          </fieldset>
        ) : null}
        {askEmployer ? (
          <fieldset className={styles.referee}>
            <legend className={styles.legend}>Your employer</legend>
            <div className={styles.fields}>
              <TextField
                name="employerName"
                label="Your employer’s name, or your manager’s"
                autoComplete="off"
                defaultValue={v.employerName}
                error={e.employerName}
              />
              <TextField
                name="employerEmail"
                label="Their work email"
                type="email"
                autoComplete="off"
                defaultValue={v.employerEmail}
                error={e.employerEmail}
              />
            </div>
            <ChoiceGroup
              name="employerNone"
              legend="If you don’t have an employer to ask"
              hideLegend
              type="checkbox"
              defaultValue={v.employerNone}
              options={[{ value: 'yes', label: 'I don’t have an employer to ask' }]}
            />
          </fieldset>
        ) : null}
        <SubmitButton variant={primary ? 'primary' : 'secondary'} fullWidth pendingLabel="Sending…">
          Ask for my references
        </SubmitButton>
      </Stack>
    </form>
  );
}
