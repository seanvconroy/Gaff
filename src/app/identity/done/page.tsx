import type { Metadata } from 'next';
import { renterIdentity } from '@/domain/identity/access';
import { currentUser } from '@/server/auth/member';
import { identityOf } from '@/server/identity/identity';
import { Outcome } from '@/ui/Outcome';
import { RenterShell } from '../../r/RenterShell';

export const metadata: Metadata = { title: 'Your ID check' };
export const dynamic = 'force-dynamic';

/**
 * P17, P29: where Stripe sends a renter back after their ID check. It shows nothing private,
 * and the renter's own link is never handed to Stripe: they go back to it from our email.
 */
export default async function IdentityDonePage() {
  const user = await currentUser();
  const identity = user ? await identityOf(user.id) : null;
  const where = renterIdentity(identity);
  return (
    <RenterShell operatorName="Gaff">
      {where === 'checked' || where === 'in_person' ? (
        <Outcome tone="success" title="Thanks, your ID is checked" headingLevel={1}>
          <p>
            It’s kept on your Gaff profile, so you won’t be asked again. Go back to the link in our
            email to see what’s left, and what happens next. You can close this page.
          </p>
        </Outcome>
      ) : identity?.status === 'not_verified' ? (
        <Outcome tone="warning" title="That didn’t work this time" headingLevel={1}>
          <p>
            Go back to the link in our email to try again, check without a selfie, or tell us your
            ID can’t be checked online.
          </p>
        </Outcome>
      ) : (
        <Outcome tone="info" title="We’re checking your ID" headingLevel={1}>
          <p>
            It usually takes a minute or two. Go back to the link in our email to see the result and
            what’s left. You can close this page.
          </p>
        </Outcome>
      )}
    </RenterShell>
  );
}
