'use client';

import { useActionState } from 'react';
import { CopyButton } from '@/ui/CopyButton';
import { TextField } from '@/ui/Field';
import { Card, CardHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { shareAction, stopSharingAction, type ShareState } from './actions';

/** R27 (Q4): the landlord gets a private, read-only page. Renters appear as "Applicant N". */
export function ShareWithLandlord({
  lettingId,
  shared,
  lastOpened,
}: {
  lettingId: string;
  shared: boolean;
  lastOpened: string | null;
}) {
  const [state, action] = useActionState<ShareState>(shareAction.bind(null, lettingId), {});
  return (
    <Card labelledBy="share-heading">
      <CardHeader
        id="share-heading"
        title="Share with the landlord"
        description="A private, read-only page with this timeline, the criteria, the ranking and the numbers. It never shows renters’ names, contact details or messages: they appear as “Applicant 1”, “Applicant 2” and so on."
        action={shared ? <StatusPill tone="success">Shared</StatusPill> : null}
      />
      {shared ? (
        <p>
          Shared.{' '}
          {lastOpened
            ? `The landlord last opened it on ${lastOpened}.`
            : 'The landlord hasn’t opened it yet.'}
        </p>
      ) : null}
      {state.error ? (
        <Notice tone="warning" role="alert">
          <p>{state.error}</p>
        </Notice>
      ) : null}
      {state.url ? (
        <Stack gap={2}>
          <TextField
            name="landlordLink"
            label="The landlord’s link"
            hint="Copy it into an email to the landlord. It’s shown only now, to keep it safe. You can always make a new one."
            readOnly
            value={state.url}
          />
          <div>
            <CopyButton value={state.url} label="Copy link" what="the landlord’s link" />
          </div>
        </Stack>
      ) : null}
      <Row>
        <form action={action}>
          <SubmitButton variant="secondary" pendingLabel="Making a link…">
            {shared ? 'Make a new link' : 'Make a private link'}
          </SubmitButton>
        </form>
        {shared ? (
          <form action={stopSharingAction.bind(null, lettingId)}>
            <SubmitButton variant="quiet" pendingLabel="Stopping…">
              Stop sharing
            </SubmitButton>
          </form>
        ) : null}
      </Row>
    </Card>
  );
}
