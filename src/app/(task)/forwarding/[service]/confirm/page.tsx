import type { Metadata } from 'next';
import { forwardingCopy } from '@/copy/forwarding';
import { forwardingHref, forwardingLeaveHref } from '@/domain/enquiries/forwarding';
import { requireMember } from '@/server/auth/member';
import { confirmationFor, forwardingFor } from '@/server/enquiries/forwarding';
import { ButtonLink } from '@/ui/Button';
import { FlowTitle } from '@/ui/FlowShell';
import { NumberedSteps } from '@/ui/NumberedSteps';
import { ForwardingConfirmationCard } from '@/app/(workspace)/inbox/ForwardingConfirmationCard';
import styles from '../../forwarding.module.css';
import { type Query, RuleValue, screenOf } from '../../parts';
import { RefreshWhileWaiting } from '../../RefreshWhileWaiting';
import { sendTestAction } from '../../actions';
import { ConfirmStep } from './ConfirmStep';

export const metadata: Metadata = { title: forwardingCopy.flow };

const copy = forwardingCopy;

/**
 * Forwarding enquiries, screen 3 of 4 (UX-LT-18): Gaff waits for the mail service's confirmation
 * email at the Gaff address, reads the code or link out of it, and shows it with a copy button.
 * Nobody has to go to Inbox to hunt for it. The page looks again while it waits, and says what to
 * do if nothing comes. Outlook doesn't usually ask, so nothing here holds the person up: "Send a
 * test enquiry" is always there.
 */
export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Query;
}) {
  const member = await requireMember();
  const { service, from } = await screenOf(params, searchParams);
  const [confirmation, { testSender }] = await Promise.all([
    confirmationFor(member, service),
    forwardingFor(member),
  ]);
  const here = forwardingHref(from, 'confirm', service);
  // Gmail forwards only once the address is confirmed: then the filter that takes enquiries.
  const gmail = service === 'gmail' || confirmation?.service === 'gmail';
  return (
    <ConfirmStep
      action={sendTestAction.bind(null, from, service)}
      leaveHref={forwardingLeaveHref(from)}
      backHref={forwardingHref(from, 'steps', service)}
      defaultTo={confirmation?.forwardingFrom ?? member.email}
    >
      {confirmation ? (
        <>
          <FlowTitle title={copy.confirm.foundTitle} />
          <ForwardingConfirmationCard
            confirmation={confirmation}
            level={2}
            then={gmail ? copy.confirm.thenFilter : copy.confirm.thenStarts}
          />
          {gmail ? (
            <div className={styles.section}>
              <h2 className="type-heading">{copy.confirm.gmailFilter.label}</h2>
              <RuleValue service="gmail" testSender={testSender} />
              <NumberedSteps
                label={copy.confirm.gmailFilter.label}
                steps={copy.confirm.gmailFilter.list}
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <FlowTitle
            title={copy.confirm.waitingTitle(service)}
            lead={copy.confirm.waitingLead(service)}
          />
          <div className={styles.section}>
            <p className={styles.muted}>{copy.confirm.nothingYet(service)}</p>
            <div>
              <ButtonLink href={here} variant="secondary">
                {copy.confirm.checkAgain}
              </ButtonLink>
            </div>
          </div>
          <RefreshWhileWaiting />
        </>
      )}
    </ConfirmStep>
  );
}
