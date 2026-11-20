'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { codeGateCopy, common } from '@/copy/renter';
import { Button } from '@/ui/Button';
import { CodeInput } from '@/ui/CodeInput';
import { FieldError } from '@/ui/Field';
import { Stack } from '@/ui/Layout';
import { enterCodeAction, sendCodeAction } from './code-actions';

/**
 * UX-RN-14, UX-SI-12: the one-time code that opens a renter's guarded pages (their checks, the
 * lister's bank details, a change of email). One button emails it to the address on their
 * application; the six boxes send themselves when the last digit goes in. Errors are said at the
 * field or at the button.
 */
export function CodeGate({
  token,
  sentTo,
  button = codeGateCopy.button,
  onOpen,
}: {
  token: string;
  /** The inbox the code goes to, with most of it hidden: "a…@example.ie". */
  sentTo: string;
  /** The button that starts it: "Start" on the checks page. */
  button?: string;
  /** Once the code is right. Left out, the page is drawn again, open. */
  onOpen?: () => void;
}) {
  const router = useRouter();
  const [sent, setSent] = useState<{ again: boolean; round: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const send = (again: boolean) =>
    startTransition(async () => {
      setProblem(null);
      const result = await sendCodeAction(token);
      if (result.sent) {
        setSent((was) => ({ again: again && !result.again, round: (was?.round ?? 0) + 1 }));
        if (again && result.again) setProblem(codeGateCopy.wait);
      } else {
        setProblem(result.problem === 'link' ? common.linkEnded : codeGateCopy[result.problem]);
      }
    });

  const enter = (code: string) =>
    startTransition(async () => {
      const result = await enterCodeAction(token, code);
      if (result === 'correct') {
        if (onOpen) onOpen();
        else router.refresh();
      } else {
        setProblem(codeGateCopy[result]);
        setSent((was) => ({ again: false, round: (was?.round ?? 0) + 1 }));
      }
    });

  if (!sent) {
    return (
      <Stack gap={3}>
        <p>{codeGateCopy.ask(sentTo)}</p>
        {problem ? <FieldError id="code-gate-problem">{problem}</FieldError> : null}
        <div>
          <Button
            variant="primary"
            fullWidth="phone"
            disabled={busy}
            aria-describedby={problem ? 'code-gate-problem' : undefined}
            onClick={() => send(false)}
          >
            {busy ? codeGateCopy.sending : button}
          </Button>
        </div>
      </Stack>
    );
  }
  return (
    <Stack gap={4}>
      <p role="status">{sent.again ? codeGateCopy.sentNew : codeGateCopy.sent(sentTo)}</p>
      <CodeInput
        // A wrong code empties the boxes for another try.
        key={sent.round}
        name="code"
        label={codeGateCopy.label}
        error={problem ?? undefined}
        hint={busy ? codeGateCopy.checking : undefined}
        autoFocus
        onComplete={enter}
      />
      <div>
        <Button variant="quiet" disabled={busy} onClick={() => send(true)}>
          {codeGateCopy.sendNew}
        </Button>
      </div>
    </Stack>
  );
}
