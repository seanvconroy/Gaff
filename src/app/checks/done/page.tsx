import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { settleRenterIdentity } from '@/server/identity/provider-results';
import { CHECK_RETURN_COOKIE, checkReturnPath } from '@/server/renter/check-return';
import { Outcome } from '@/ui/Outcome';
import { PrivateFrame } from '@/ui/PrivateFrame';

export const metadata: Metadata = { title: 'Check done' };
export const dynamic = 'force-dynamic';

/**
 * R18, UX-RN-17: where the ID or income provider sends the renter back. The provider is never
 * given the renter's own link, so this address shows nothing private. The browser that started
 * the check remembers the way back, and goes straight to the renter's page, which shows the next
 * check. Anywhere else (another device, or an hour later) it says to use the link in the email.
 */
export default async function CheckDonePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const token = (await cookies()).get(CHECK_RETURN_COOKIE)?.value;
  const back = checkReturnPath(token);
  // P21, P54: back from Stripe's pages, the result is read from Stripe now, in case its webhook
  // is still on the way. Nothing is read from this address.
  if (back && token && kind === 'identity') await settleRenterIdentity(token);
  // UX-PF-8: back from the ID check, the page asks whether to keep it, if it passed.
  if (back) redirect(kind === 'identity' ? `${back}?q=keep_id` : back);
  const what = kind === 'income' ? 'income check' : kind === 'identity' ? 'ID check' : 'check';
  return (
    <PrivateFrame audience="renter" lister={null}>
      <Outcome tone="success" title={`Thanks, that’s your ${what} done`} headingLevel={1}>
        <p>Open the link in our email to see what’s next. You can close this page.</p>
      </Outcome>
    </PrivateFrame>
  );
}
