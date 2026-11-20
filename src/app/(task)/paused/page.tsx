import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { pausedCopy } from '@/copy/trust';
import { factsInWords } from '@/copy/trust-emails';
import { formatDate } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { pauseFor } from '@/server/trust/pauses';
import { ButtonLink } from '@/ui/Button';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { StepForm } from '../lettings/[lettingId]/tenancy/StepForm';
import { askAboutPauseAction } from './actions';

export const metadata: Metadata = { title: pausedCopy.title };
export const dynamic = 'force-dynamic';

const copy = pausedCopy;
const lettingsHref = '/lettings';

/**
 * BA-10 (M107, M98): a lister whose listings Gaff's team paused. Why, since when, and what the
 * decision relied on (the statement of reasons they were emailed); what it means; and one
 * button: "Ask Gaff to look again", the appeal a different person decides. Once asked, or once
 * the appeal is decided, it says where it stands. A lister who isn't paused goes to their
 * lettings.
 */
export default async function PausedPage() {
  const member = await requireMember();
  const pause = await pauseFor(member);
  if (!pause) redirect(lettingsHref);
  const statement = (
    <>
      <p>{copy.why(pause.reason, formatDate(pause.pausedAt))}</p>
      <p>{copy.reliedOn(factsInWords(pause.facts))}</p>
      <p>{copy.meanwhile}</p>
    </>
  );
  if (pause.appeal !== 'none') {
    return (
      <FlowShell
        leave={{ kind: 'close', href: lettingsHref, label: copy.back }}
        primary={
          <ButtonLink href={lettingsHref} variant="primary" fullWidth="phone">
            {copy.back}
          </ButtonLink>
        }
      >
        <FlowTitle title={copy.title} />
        <Stack gap={4}>
          {statement}
          <p>{pause.appeal === 'asked' ? copy.asked : copy.kept}</p>
        </Stack>
      </FlowShell>
    );
  }
  return (
    <StepForm
      action={askAboutPauseAction}
      leave={{ kind: 'close', href: lettingsHref, label: copy.back }}
      title={copy.title}
      primary={copy.button}
      pendingLabel={copy.asking}
    >
      <Stack gap={4}>
        {statement}
        <p>{copy.fix}</p>
        <p>{copy.next}</p>
      </Stack>
    </StepForm>
  );
}
