'use client';

import { useState } from 'react';
import { passkeyCopy } from '@/copy/sign-in';
import type { DeviceKind } from '@/domain/auth/passkey-offer';
import { Button, ButtonLink } from '@/ui/Button';
import { FieldError } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { authClient } from '../../auth-client';
import styles from '../sign-in.module.css';
import { rememberPasskeyAnswer } from './actions';

/**
 * UX-SI-4: one sheet, "Sign in faster next time", in the device's own words. "Turn it on" hands
 * over to the device's own prompt. "Not now", or closing the sheet, is remembered for 30 days.
 * Either way the person goes on to where they were headed.
 */
export function PasskeyOffer({ device, next }: { device: DeviceKind; next: string }) {
  const [open, setOpen] = useState(true);
  const [working, setWorking] = useState<'on' | 'later' | null>(null);
  const [failed, setFailed] = useState(false);

  const goOn = () => window.location.assign(next);

  const notNow = async () => {
    if (working) return;
    setWorking('later');
    setOpen(false);
    await rememberPasskeyAnswer('later');
    goOn();
  };

  const turnOn = async () => {
    setWorking('on');
    setFailed(false);
    const result = await authClient.passkey.addPasskey();
    // The device already holds a passkey for this account: nothing to add, and nothing wrong.
    const problem = result?.error as { code?: string } | null | undefined;
    const already = problem?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED';
    if (result?.error && !already) {
      setWorking(null);
      setFailed(true);
      return;
    }
    await rememberPasskeyAnswer('added');
    goOn();
  };

  return (
    <div className={styles.screen}>
      <div className={styles.title}>
        <h1 className="type-display-mobile">{passkeyCopy.signedIn}</h1>
      </div>
      <ButtonLink href={next} fullWidth>
        {passkeyCopy.continue}
      </ButtonLink>
      <Sheet
        open={open}
        onClose={() => void notNow()}
        title={passkeyCopy.title}
        description={passkeyCopy.description(device)}
        footer={
          <>
            <Button variant="primary" disabled={working !== null} onClick={() => void turnOn()}>
              {working === 'on' ? passkeyCopy.turningOn : passkeyCopy.turnOn}
            </Button>
            <Button variant="quiet" disabled={working !== null} onClick={() => void notNow()}>
              {passkeyCopy.notNow}
            </Button>
          </>
        }
      >
        {failed ? <FieldError id="passkey-error">{passkeyCopy.failed}</FieldError> : null}
      </Sheet>
    </div>
  );
}
