import type { Metadata } from 'next';
import { homePageCopy, reportCopy as copy } from '@/copy/home-page';
import { homeHref, isPublicRef } from '@/domain/homes/home-page';
import { publicHomes } from '@/server/homes/public-homes';
import { ButtonLink } from '@/ui/Button';
import { FlowShell } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { reportAction } from './actions';
import { ReportForm } from './ReportForm';

export const metadata: Metadata = { title: copy.pageTitle };

/**
 * UX-TS-3: "Report this listing", from the foot of every home's page. One question with tap
 * answers, and no account needed. Where the report goes is work package WP-26 (`reportListing`).
 */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ sent?: string; gone?: string }>;
}) {
  const [{ ref }, query] = await Promise.all([params, searchParams]);
  const back = isPublicRef(ref) ? homeHref(ref) : '/';
  const [home] = query.sent ? [] : await publicHomes({ ref });
  if (query.sent || !home) {
    const sent = Boolean(query.sent);
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
          {sent ? <p>{copy.sent.text}</p> : null}
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
