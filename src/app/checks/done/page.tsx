import type { Metadata } from 'next';
import { Outcome } from '@/ui/Outcome';
import { RenterShell } from '../../r/RenterShell';

export const metadata: Metadata = { title: 'Check done' };

/**
 * R18: where the ID or income provider sends the renter back. It shows nothing private, so
 * the renter's own link is never handed to the provider.
 */
export default async function CheckDonePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const what = kind === 'income' ? 'income check' : 'check';
  return (
    <RenterShell operatorName="Gaff">
      <Outcome tone="success" title={`Thanks, that’s your ${what} done`} headingLevel={1}>
        <p>
          Go back to the link in our email to see what’s left, and what happens next. You can close
          this page.
        </p>
      </Outcome>
    </RenterShell>
  );
}
