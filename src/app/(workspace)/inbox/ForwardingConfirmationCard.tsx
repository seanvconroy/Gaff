import {
  type ForwardingConfirmation,
  mailServiceNames,
} from '@/domain/enquiries/forwarding-confirmation';
import { CopyButton } from '@/ui/CopyButton';
import { Card, CardHeader, Row, Stack } from '@/ui/Layout';
import styles from './inbox.module.css';

/**
 * UX-NV-17, UX-LT-18: the code or link a mail service sent to confirm that mail may be forwarded
 * to Gaff, read out of its email, with a copy button. Shown in Inbox, on the email itself, and on
 * the forwarding flow's confirming screen. A link is the mail service's own (the reader allows
 * no other site): the person opens it in their browser; Gaff never fetches it.
 */
export function ForwardingConfirmationCard({
  confirmation,
  level = 3,
  then = 'Forwarding starts once you do.',
}: {
  confirmation: ForwardingConfirmation;
  level?: 2 | 3;
  /** What happens once it's confirmed. */
  then?: string;
}) {
  const service = mailServiceNames[confirmation.service];
  return (
    <Card tone="quiet" labelledBy="confirmation-title">
      <Stack gap={4}>
        <CardHeader
          id="confirmation-title"
          level={level}
          title={
            confirmation.code ? `${service}’s confirmation code` : `${service}’s confirmation link`
          }
          description={
            confirmation.forwardingFrom
              ? `${service} is checking that mail from ${confirmation.forwardingFrom} should be forwarded to Gaff.`
              : `${service} is checking that your mail should be forwarded to Gaff.`
          }
        />
        {confirmation.code ? (
          <>
            <Row>
              <p className={`type-heading ${styles.code}`}>{confirmation.code}</p>
              <CopyButton value={confirmation.code} what="the confirmation code" />
            </Row>
            <p>
              Type it into {service}’s forwarding settings. {then}
            </p>
          </>
        ) : null}
        {confirmation.link ? (
          <>
            <p>
              {confirmation.code ? 'Or open' : 'Open'} {service}’s link to confirm. {then}
            </p>
            <Row>
              <p className={styles.link}>
                <a href={confirmation.link} target="_blank" rel="noopener noreferrer">
                  {confirmation.link}
                </a>
              </p>
              <CopyButton value={confirmation.link} label="Copy link" what="to the confirmation" />
            </Row>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}
