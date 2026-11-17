import type { ListingReport } from '@/domain/homes/report';
import { resolvePublicHome } from './public-homes';

/**
 * UX-TS-3: a visitor reported a live home's listing. THE SEAM for work package WP-26, which
 * keeps the report, puts it on Gaff's team's internal page and lets them hide the listing
 * (UX-TS-4, UX-TS-5; `lettings.hiddenAt`). Until then a report is checked and accepted here and
 * kept nowhere, and nothing is recorded about whoever sent it. False: the home has no page.
 */
export async function reportListing(ref: string, _report: ListingReport): Promise<boolean> {
  return (await resolvePublicHome(ref)) !== null;
}
