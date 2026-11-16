'use client';

import { useState } from 'react';
import { codeCopy, confirmCopy, signInCopy } from '@/copy/sign-in';
import type { SensitiveAction } from '@/domain/auth/confirm';
import { Button } from '@/ui/Button';
import { CodeInput } from '@/ui/CodeInput';
import { FieldError } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { authClient } from '../auth-client';
import { useCountdown } from '../countdown';
import styles from '../sign-in/sign-in.module.css';
import { checkConfirmCode, sendConfirmCode } from './actions';

/** The header that tells the server a passkey is confirming an action, not signing in. */
const CONFIRM_HEADER = 'x-gaff-confirm';

type Problem = 'wrong' | 'expired' | 'not_sent' | 'too_many' | 'passkey';

const problemWords: Record<Problem, string> = {
  wrong: codeCopy.wrong,
  expired: codeCopy.expired,
  not_sent: signInCopy.errors.notSent,
  too_many: signInCopy.errors.tooMany,
  passkey: confirmCopy.passkeyFailed,
};

/**
 * UX-SI-10: "Confirm it's you", in a sheet, before a sensitive action. A passkey if the person
 * has one, or a fresh code by email. When it's done, `onConfirmed` runs: the form that asked
 * sends itself again, and the server finds the confirmation and spends it with the change.
 *
 * To use it for another action, see src/server/auth/confirm.ts.
 */
export function ConfirmItsYou({
  open,
  action,
  email,
  hasPasskey,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  action: SensitiveAction;
  /** The signed-in person's own email, where the code goes. */
  email: string;
  hasPasskey: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [step, setStep] = useState<'choose' | 'code'>('choose');
  const [working, setWorking] = useState<'passkey' | 'send' | 'check' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sent, setSent] = useState({ resendIn: 0, stamp: 0 });
  const resendIn = useCountdown(sent.resendIn, sent.stamp);

  const confirmByPasskey = async () => {
    setWorking('passkey');
    setProblem(null);
    const result = await authClient.signIn.passkey({
      fetchOptions: { headers: { [CONFIRM_HEADER]: action } },
    });
    setWorking(null);
    if (!result || result.error || !result.data) return setProblem('passkey');
    onConfirmed();
  };

  const sendCode = async () => {
    setWorking('send');
    setProblem(null);
    const result = await sendConfirmCode(action);
    setWorking(null);
    if (!result.sent) return setProblem(result.reason === 'too_many' ? 'too_many' : 'not_sent');
    setSent({ resendIn: result.resendIn, stamp: Date.now() });
    setStep('code');
  };

  const checkCode = async (code: string) => {
    setWorking('check');
    setProblem(null);
    const result = await checkConfirmCode(action, code);
    setWorking(null);
    if (result === 'correct') return onConfirmed();
    setProblem(result === 'wrong' ? 'wrong' : 'expired');
    // A new input after each answer: a wrong code clears it.
    setSent((previous) => ({ resendIn: resendIn, stamp: previous.stamp + 1 }));
  };

  const busy = working !== null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={confirmCopy.title}
      description={step === 'choose' ? confirmCopy.why(action) : confirmCopy.sentTo(email)}
      footer={
        step === 'choose' ? (
          hasPasskey ? (
            <>
              <Button variant="quiet" disabled={busy} onClick={() => void sendCode()}>
                {working === 'send' ? confirmCopy.sending : confirmCopy.emailCodeInstead}
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void confirmByPasskey()}>
                {working === 'passkey' ? confirmCopy.waitingForPasskey : confirmCopy.usePasskey}
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void sendCode()}>
              {working === 'send' ? confirmCopy.sending : confirmCopy.emailCode}
            </Button>
          )
        ) : (
          <Button
            variant={problem === 'expired' ? 'primary' : 'secondary'}
            disabled={busy || resendIn > 0}
            onClick={() => void sendCode()}
          >
            {working === 'send'
              ? codeCopy.sendingNew
              : resendIn > 0
                ? codeCopy.sendNewIn(resendIn)
                : codeCopy.sendNew}
          </Button>
        )
      }
    >
      {step === 'code' ? (
        <form
          className={styles.actions}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void checkCode(String(new FormData(event.currentTarget).get('confirmCode') ?? ''));
          }}
        >
          <CodeInput
            key={sent.stamp}
            name="confirmCode"
            label={codeCopy.label}
            error={problem && problem !== 'passkey' ? problemWords[problem] : undefined}
            autoFocus
            onComplete={(code) => void checkCode(code)}
          />
          <p className="visually-hidden" role="status">
            {working === 'check' ? codeCopy.checking : ''}
          </p>
        </form>
      ) : problem ? (
        <FieldError id="confirm-error">{problemWords[problem]}</FieldError>
      ) : null}
    </Sheet>
  );
}
