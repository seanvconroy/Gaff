'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { Card, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
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
  const [copied, setCopied] = useState(false);
  return (
    <Card labelledBy="share-heading">
      <Stack gap={4}>
        <h2 id="share-heading" className="type-title">
          Share with the landlord
        </h2>
        <p>
          Give the landlord a private, read-only page with this timeline, the criteria, the ranking
          and the numbers. It never shows renters’ names, contact details or messages: they appear
          as “Applicant 1”, “Applicant 2” and so on.
        </p>
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
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(state.url!).then(() => setCopied(true));
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
          </Stack>
        ) : null}
        <div>
          <form action={action}>
            <SubmitButton variant="secondary" pendingLabel="Making a link…">
              {shared ? 'Make a new link' : 'Make a private link'}
            </SubmitButton>
          </form>
        </div>
        {shared ? (
          <form action={stopSharingAction.bind(null, lettingId)}>
            <SubmitButton variant="quiet" pendingLabel="Stopping…">
              Stop sharing
            </SubmitButton>
          </form>
        ) : null}
      </Stack>
    </Card>
  );
}
