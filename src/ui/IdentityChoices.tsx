import { identityExplained, identityReasonWords } from '@/copy/identity';
import { ChoiceGroup } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';

type Action = (formData: FormData) => void | Promise<void>;

/**
 * P17 to P20: the identity check, explained before it starts, with three equal choices: a
 * selfie after explicit agreement, the document alone, or "can't be checked online". Used on
 * the letter's Checks page and the chosen renter's checks page.
 */
export function IdentityChoices({
  audience,
  startAction,
  offlineAction,
  attemptsLeft,
  reason,
  fullWidth,
}: {
  audience: 'renter' | 'letter';
  startAction: Action;
  offlineAction: Action;
  attemptsLeft: number;
  reason?: string | null;
  fullWidth?: boolean;
}) {
  return (
    <Stack gap={4}>
      {reason ? (
        <Notice tone="warning" title="That didn’t work this time">
          <p>
            {identityReasonWords[reason] ?? 'The check didn’t finish.'}{' '}
            {attemptsLeft > 0
              ? `You have ${attemptsLeft === 1 ? 'one more try' : `${attemptsLeft} more tries`}.`
              : ''}
          </p>
        </Notice>
      ) : null}
      <p>{identityExplained.how}</p>
      <p>{identityExplained.biometric}</p>
      <p>{identityExplained.once}</p>
      {attemptsLeft > 0 ? (
        <form action={startAction}>
          <Stack gap={4}>
            <ChoiceGroup
              name="consent"
              legend="The selfie"
              type="checkbox"
              options={[{ value: 'yes', label: identityExplained.consent }]}
            />
            <div>
              <SubmitButton
                fullWidth={fullWidth}
                name="selfie"
                value="yes"
                pendingLabel="Opening the check…"
              >
                Check my ID with a selfie
              </SubmitButton>
            </div>
            <p>{identityExplained.withoutSelfie[audience]}</p>
            <div>
              <SubmitButton
                fullWidth={fullWidth}
                variant="secondary"
                name="selfie"
                value="no"
                pendingLabel="Opening the check…"
              >
                Check my ID without a selfie
              </SubmitButton>
            </div>
          </Stack>
        </form>
      ) : null}
      <form action={offlineAction}>
        <Stack gap={4}>
          <p>{identityExplained.offline[audience]}</p>
          <div>
            <SubmitButton fullWidth={fullWidth} variant="quiet" pendingLabel="Saving…">
              My ID can’t be checked online
            </SubmitButton>
          </div>
        </Stack>
      </form>
    </Stack>
  );
}
