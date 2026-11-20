'use client';

import { Mail, Phone } from 'lucide-react';
import { useState } from 'react';
import { talkCopy } from '@/copy/frame';
import type { WaysToReachAPerson } from '@/domain/frame/frame';
import { Button, buttonProps } from './Button';
import { Sheet } from './Sheet';
import styles from './TalkToAPerson.module.css';

/**
 * "Talk to a person", on every renter's page (UX-PP-3, UX-AI-2; product rule 6). It opens a
 * sheet with the ways to reach one: replying to any email always works, and the lister's phone
 * number sits beside it when they have given one (Q43).
 */
export function TalkToAPerson({
  listerName,
  phone,
}: {
  /** Null where a link has ended and names no lister. */
  listerName: string | null;
  /** From `reachAPerson`: null until the lister has a phone number on file. */
  phone: WaysToReachAPerson['phone'];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="quiet" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {talkCopy.button}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={talkCopy.title}
        footer={
          <Button variant="quiet" fullWidth="phone" onClick={() => setOpen(false)}>
            {talkCopy.done}
          </Button>
        }
      >
        <div className={styles.route}>
          <span className={styles.icon} aria-hidden="true">
            <Mail size={20} strokeWidth={1.75} />
          </span>
          <div className={styles.words}>
            <p className={styles.title}>{talkCopy.emailTitle}</p>
            <p>{talkCopy.emailText(listerName)}</p>
          </div>
        </div>
        {phone ? (
          <div className={styles.route}>
            <span className={styles.icon} aria-hidden="true">
              <Phone size={20} strokeWidth={1.75} />
            </span>
            <div className={styles.words}>
              <p className={styles.title}>{talkCopy.phoneTitle(listerName)}</p>
              <a href={phone.href} {...buttonProps('secondary', true)}>
                {talkCopy.ring(phone.shown)}
              </a>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
