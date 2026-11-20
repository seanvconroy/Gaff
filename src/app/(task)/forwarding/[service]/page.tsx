import type { Metadata } from 'next';
import { forwardingCopy } from '@/copy/forwarding';
import { forwardingHref, forwardingLeaveHref } from '@/domain/enquiries/forwarding';
import { requireMember } from '@/server/auth/member';
import { forwardingFor } from '@/server/enquiries/forwarding';
import { ButtonLink } from '@/ui/Button';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { NumberedSteps } from '@/ui/NumberedSteps';
import styles from '../forwarding.module.css';
import { CopyValue, OpenSettings, type Query, RuleValue, screenOf } from '../parts';
import { progress } from '../progress';

export const metadata: Metadata = { title: forwardingCopy.flow };

const copy = forwardingCopy;

/**
 * Forwarding enquiries, screen 2 of 4 (UX-LT-17): the Gaff address with a copy button, and
 * three numbered steps for the chosen mail service, with a button that opens its settings. The
 * person makes the change in their own mail; Gaff never signs in to it.
 */
export default async function ForwardStepsPage({
  params,
  searchParams,
}: {
  params: Promise<{ service: string }>;
  searchParams: Query;
}) {
  const member = await requireMember();
  const { service, from } = await screenOf(params, searchParams);
  const { gaffAddress, testSender } = await forwardingFor(member);
  return (
    <FlowShell
      leave={{ kind: 'close', href: forwardingLeaveHref(from) }}
      progress={progress(1)}
      back={
        <ButtonLink href={forwardingHref(from)} variant="quiet">
          {copy.back}
        </ButtonLink>
      }
      primary={
        <ButtonLink
          href={forwardingHref(from, 'confirm', service)}
          variant="primary"
          fullWidth="phone"
        >
          {copy.steps.done}
        </ButtonLink>
      }
    >
      <FlowTitle title={copy.steps.title} lead={copy.steps.lead} />
      <div className={styles.section}>
        <CopyValue label={copy.steps.address} value={gaffAddress} what={copy.steps.copyAddress} />
        {/* Gmail's filter comes once the address is confirmed, on the next screen. */}
        {service === 'gmail' ? null : <RuleValue service={service} testSender={testSender} />}
      </div>
      <NumberedSteps label={copy.steps.label(service)} steps={copy.steps.list[service]} />
      <OpenSettings service={service} />
    </FlowShell>
  );
}
