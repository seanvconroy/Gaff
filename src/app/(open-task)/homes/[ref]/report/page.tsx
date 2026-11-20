import type { Metadata } from 'next';
import { homePageCopy, reportCopy as copy } from '@/copy/home-page';
import { homeHref, isPublicRef } from '@/domain/homes/home-page';
import { formatDateTime } from '@/lib/format';
import { publicHomes } from '@/server/homes/public-homes';
import { ButtonLink } from '@/ui/Button';
import { FlowShell } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { reportAction } from './actions';
import { ReportForm } from './ReportForm';

export const metadata: Metadata = { title: copy.pageTitle };

/**
 * UX-TS-3, BA-9: "Report this listing", from the foot of every home's page. One question with
 * tap answers, then an email for the outcome if they want it, and no account needed. It opens
 * or joins a case a person on Gaff's team decides (`reportListing`), and is acknowledged at
 * once, with when they'll look.
 */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{
    sent?: string;
    gone?: string;
    limited?: string;
    by?: string;
    email?: string;
  }>;
}) {
  const [{ ref }, query] = await Promise.all([params, searchParams]);
  const back = isPublicRef(ref) ? homeHref(ref) : '/';
  if (query.limited) {
    return (
      <FlowShell
        leave={{ kind: 'close', href: back, label: copy.back }}
        primary={
          <ButtonLink href={back} variant="primary" fullWidth="phone">
            {copy.sent.action}
          </ButtonLink>
        }
      >
        <Outcome tone="info" title={copy.limited.title} headingLevel={1}>
          <p>{copy.limited.text}</p>
        </Outcome>
      </FlowShell>
    );
  }
  const [home] = query.sent ? [] : await publicHomes({ ref });
  if (query.sent || !home) {
    const sent = Boolean(query.sent);
    // M97: when a person will look, from the case. Only a time is in the link, never an answer.
    const by = query.by ? new Date(query.by) : null;
    const said =
      by && !Number.isNaN(by.getTime())
        ? copy.sent.text(formatDateTime(by), query.email === '1')
        : copy.sent.soon;
    return (
      <FlowShell
        leave={{ kind: 'close', href: back, label: copy.back }}
        primary={
          <ButtonLink href={sent ? back : '/'} variant="primary" fullWidth="phone">
            {sent ? copy.sent.action : homePageCopy.notAvailable.action}
          </ButtonLink>
        }
      >
        <Outcome
          tone={sent ? 'success' : 'info'}
          title={sent ? copy.sent.title : copy.gone}
          headingLevel={1}
        >
          {sent ? <p>{said}</p> : null}
        </Outcome>
      </FlowShell>
    );
  }
  return (
    <ReportForm
      action={reportAction.bind(null, ref)}
      homeHref={back}
      address={home.home.addressLine1}
    />
  );
}
