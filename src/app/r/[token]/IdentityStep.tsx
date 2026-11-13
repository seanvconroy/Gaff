import type { IdentityStage } from '@/domain/identity/access';
import { formatDate } from '@/lib/format';
import { TextField } from '@/ui/Field';
import { IdentityChoices } from '@/ui/IdentityChoices';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { StepCard, type StepState } from '@/ui/StepCard';
import { SubmitButton } from '@/ui/SubmitButton';
import styles from '../renter.module.css';
import {
  confirmChecksCodeAction,
  sendChecksCodeAction,
  startRenterIdentityAction,
} from './identity-actions';

export interface RenterIdentityView {
  /** The signed-in person is this application's renter. */
  signedIn: boolean;
  maskedEmail: string;
  where: IdentityStage;
  reason: string | null;
  attemptsLeft: number;
  checkedAt: Date | null;
}

const codeProblems: Record<string, string> = {
  wrong:
    'That code isn’t right, or it’s more than 10 minutes old. Check the email, or ask for a new code.',
  not_sent: 'That didn’t send. Wait a minute and try again.',
  not_yours:
    'That email address doesn’t match the one you enquired with. Reply to our email and we’ll help.',
};

const startProblems: Record<string, string> = {
  consent_needed: 'Press “Agree and check my ID” to agree to the selfie check.',
  no_attempts_left:
    'That’s three tries. Reply to any email from us, and a person at Gaff will give you more tries.',
  checked: 'Your ID is already checked.',
  not_yours: 'Confirm your email first.',
};

/**
 * P15 to P20, P29: the chosen renter's identity, once ever. First they confirm the email they
 * enquired with, which gives them a Gaff profile; then the check, kept for every later home.
 */
export function IdentityStep({
  token,
  operatorName,
  state,
  identity,
  code,
  problem,
}: {
  token: string;
  operatorName: string;
  state: StepState;
  identity: RenterIdentityView;
  code?: string;
  problem?: string;
}) {
  const done = identity.signedIn && identity.where === 'checked';
  return (
    <StepCard
      id="check-identity"
      headingLevel={3}
      number={1}
      title="Your ID"
      state={done ? 'done' : state}
      status={
        done ? (
          <StatusPill tone="success" large>
            Done
          </StatusPill>
        ) : identity.signedIn && identity.where === 'started' ? (
          <StatusPill tone="info" large>
            Started
          </StatusPill>
        ) : null
      }
    >
      {!identity.signedIn ? (
        <Stack gap={4}>
          <p>
            First, confirm it’s you. We’ll email a 6-digit code to {identity.maskedEmail}. This sets
            up your Gaff profile, so you only check your ID once, for this home and any after it.
          </p>
          {code && codeProblems[code] ? (
            <Notice tone="warning" role="alert">
              <p>{codeProblems[code]}</p>
            </Notice>
          ) : null}
          {code === 'sent' || code === 'wrong' ? (
            <form action={confirmChecksCodeAction.bind(null, token)}>
              <Stack gap={4}>
                <TextField
                  name="code"
                  label="The code from the email"
                  width="short"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <div>
                  <SubmitButton fullWidth pendingLabel="Checking…">
                    Confirm
                  </SubmitButton>
                </div>
              </Stack>
            </form>
          ) : null}
          <form action={sendChecksCodeAction.bind(null, token)}>
            <SubmitButton
              fullWidth
              variant={code === 'sent' || code === 'wrong' ? 'quiet' : 'primary'}
              pendingLabel="Sending…"
            >
              {code === 'sent' || code === 'wrong' ? 'Send a new code' : 'Email me a code'}
            </SubmitButton>
          </form>
        </Stack>
      ) : identity.where === 'checked' ? (
        <p>
          Checked{identity.checkedAt ? ` on ${formatDate(identity.checkedAt)}` : ''}, and kept on
          your Gaff profile. {operatorName} sees that it’s checked and the name on your ID, nothing
          else.
        </p>
      ) : (
        <Stack gap={4}>
          {problem && startProblems[problem] ? (
            <Notice tone="warning" role="alert">
              <p>{startProblems[problem]}</p>
            </Notice>
          ) : null}
          {identity.where === 'started' ? (
            <p className={styles.muted}>If you didn’t finish, you can start again.</p>
          ) : null}
          <IdentityChoices
            startAction={startRenterIdentityAction.bind(null, token)}
            attemptsLeft={identity.attemptsLeft}
            reason={identity.reason}
            fullWidth
          />
        </Stack>
      )}
    </StepCard>
  );
}
