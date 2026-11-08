import { identityExplained, identityReasonWords } from '@/copy/identity';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';

type Action = (formData: FormData) => void | Promise<void>;

/**
 * P17, P18, P25 (Q60): the identity check, explained before it starts: a photo ID and a live
 * selfie, agreed to with one button. After three tries that don't work, a person at Gaff can
 * give more. Used on the letter's Checks page and the chosen renter's checks page.
 */
export function IdentityChoices({
  startAction,
  attemptsLeft,
  reason,
  fullWidth,
}: {
  startAction: Action;
  attemptsLeft: number;
  reason?: string | null;
  fullWidth?: boolean;
}) {
  return (
    <Stack gap={4}>
      {reason && attemptsLeft > 0 ? (
        <Notice tone="warning" title="That didn’t work this time">
          <p>
            {identityReasonWords[reason] ?? 'The check didn’t finish.'}{' '}
            {`You have ${attemptsLeft === 1 ? 'one more try' : `${attemptsLeft} more tries`}.`}
          </p>
        </Notice>
      ) : null}
      {attemptsLeft > 0 ? (
        <>
          <p>{identityExplained.how}</p>
          <p>{identityExplained.biometric}</p>
          <p>{identityExplained.once}</p>
          <form action={startAction}>
            <Stack gap={4}>
              <p>{identityExplained.consent}</p>
              <div>
                <SubmitButton
                  fullWidth={fullWidth}
                  name="consent"
                  value="yes"
                  pendingLabel="Opening the check…"
                >
                  Agree and check my ID
                </SubmitButton>
              </div>
            </Stack>
          </form>
        </>
      ) : (
        <Notice tone="warning" title="That didn’t work this time">
          <p>{identityExplained.noTriesLeft}</p>
        </Notice>
      )}
    </Stack>
  );
}
