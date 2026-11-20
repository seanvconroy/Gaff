'use client';

import { renterDocumentsCopy } from '@/copy/documents';
import { common } from '@/copy/renter';
import { amountPeriods, type DocumentKind, isWorkKind } from '@/domain/documents/kinds';
import type { DocumentReading } from '@/domain/documents/reading';
import { ButtonLink } from '@/ui/Button';
import { SelectField, TextField } from '@/ui/Field';
import { SubmitButton } from '@/ui/SubmitButton';
import { useSend } from '@/ui/useSend';
import styles from '../../../renter.module.css';
import { correctDocumentAction } from '../../document-actions';

const copy = renterDocumentsCopy.change;

/**
 * BA-16 (P39, P5): what Gaff read from one document, for the renter to change, or to fill in.
 * Only the fields Gaff keeps: never a PPS number or bank details, and for other income no
 * employer or payer. Errors are at the field.
 */
export function CorrectionForm({
  token,
  documentId,
  kind,
  reading,
}: {
  token: string;
  documentId: string;
  kind: DocumentKind;
  reading: DocumentReading;
}) {
  const [state, action] = useSend(
    correctDocumentAction.bind(null, token, documentId),
    common.sendFailed,
    'name',
  );
  const values = state.values ?? {};
  const value = (field: string, fallback: string | number | null) =>
    values[field] ?? (fallback === null ? '' : String(fallback));
  const periods = amountPeriods.filter((p) => p !== 'balance' || kind === 'other_income');
  const yearly = kind === 'revenue_statement' || kind === 'accountant_letter';
  return (
    <form key={state.attempt ?? 'first'} action={action} noValidate className={styles.task}>
      <TextField
        name="name"
        label={copy.name}
        autoComplete="off"
        defaultValue={value('name', reading.name)}
        error={state.errors?.name}
      />
      <TextField
        name="date"
        label={copy.date}
        hint={copy.dateHint}
        optional
        width="medium"
        inputMode="numeric"
        defaultValue={value('date', reading.date)}
        error={state.errors?.date}
      />
      {isWorkKind(kind) && !yearly ? (
        <TextField
          name="employer"
          label={copy.employer}
          optional
          autoComplete="off"
          defaultValue={value('employer', reading.employer)}
          error={state.errors?.employer}
        />
      ) : null}
      {yearly ? (
        <TextField
          name="taxYear"
          label={copy.taxYear}
          optional
          width="short"
          inputMode="numeric"
          defaultValue={value('taxYear', reading.taxYear)}
          error={state.errors?.taxYear}
        />
      ) : null}
      <TextField
        name="amount"
        label={copy.amount(kind)}
        optional
        width="medium"
        prefix="€"
        inputMode="decimal"
        defaultValue={value(
          'amount',
          reading.amountCents === null ? null : (reading.amountCents / 100).toLocaleString('en-IE'),
        )}
        error={state.errors?.amount}
      />
      <SelectField
        name="period"
        label={copy.period}
        optional
        width="medium"
        options={[
          { value: '', label: '' },
          ...periods.map((period) => ({ value: period, label: copy.periods[period] })),
        ]}
        defaultValue={value('period', reading.period)}
        error={state.errors?.period}
      />
      <div className={styles.actions}>
        <SubmitButton fullWidth="phone" pendingLabel={copy.saving}>
          {copy.save}
        </SubmitButton>
        <ButtonLink href={`/r/${token}`} variant="quiet" fullWidth="phone">
          {copy.cancel}
        </ButtonLink>
      </div>
    </form>
  );
}
