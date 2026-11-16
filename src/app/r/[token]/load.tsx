import { linkEnded } from '@/copy/renter';
import { env } from '@/lib/env';
import { maskedEmail } from '@/server/access/link-codes';
import { loadRenterPage, openRenterPage } from '@/server/renter/answers';
import { linkIsOpen } from '@/server/renter/gate';
import { renterModel } from '@/server/renter/model';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';

/**
 * What every one of a renter's pages starts from: what their link holds now, and the same in the
 * words a page shows. `hub` is the link's own page, which also notes the step they reached
 * (UX-ME-4); the pages under it don't.
 */
export async function loadRenter(token: string, options: { hub?: boolean } = {}) {
  const page = await (options.hub ? openRenterPage(token) : loadRenterPage(token));
  if (!page) return null;
  const model = renterModel(page, {
    providers: {
      identity: env().IDENTITY_PROVIDER !== 'none',
      income: env().INCOME_PROVIDER !== 'none',
    },
    retentionDays: env().RETENTION_PERSONAL_DAYS,
  });
  return {
    page,
    model,
    /** UX-RN-14: whether this browser may see the guarded pages. Asked only where it matters. */
    isOpen: () => linkIsOpen(token, page.application.email),
    /** Where a one-time code would go, with most of the address hidden. */
    sentTo: maskedEmail(page.application.email),
  };
}

/** States: the link has expired or been withdrawn. It names nobody, and still reaches a person. */
export function LinkEnded() {
  return (
    <PrivateFrame audience="renter" lister={null}>
      <Outcome tone="info" title={linkEnded.title} headingLevel={1}>
        <p>{linkEnded.text}</p>
      </Outcome>
    </PrivateFrame>
  );
}
