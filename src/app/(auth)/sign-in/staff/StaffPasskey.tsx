'use client';

import { useState } from 'react';
import { signInCopy, staffPasskeyCopy } from '@/copy/sign-in';
import { Button } from '@/ui/Button';
import { FieldError } from '@/ui/Field';
import { authClient } from '../../auth-client';
import styles from '../sign-in.module.css';

/**
 * BA-8 (M5): one button, the device's own passkey prompt, and on to /internal. The passkey
 * starts a session that says it began with a passkey, which is what Gaff's own pages ask for.
 */
export function StaffPasskey({ returnTo }: { returnTo: string }) {
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const usePasskey = async () => {
    setWorking(true);
    setProblem(null);
    const result = await authClient.signIn.passkey();
    if (!result || result.error || !result.data) {
      setWorking(false);
      setProblem(
        result?.error?.status === 429 ? signInCopy.errors.slowDown(60) : staffPasskeyCopy.failed,
      );
      return;
    }
    window.location.assign(returnTo);
  };

  return (
    <div className={styles.actions}>
      <Button
        variant="primary"
        fullWidth
        disabled={working}
        aria-describedby={problem ? 'staff-passkey-error' : undefined}
        onClick={() => void usePasskey()}
      >
        {working ? staffPasskeyCopy.waiting : staffPasskeyCopy.use}
      </Button>
      {problem ? <FieldError id="staff-passkey-error">{problem}</FieldError> : null}
    </div>
  );
}
