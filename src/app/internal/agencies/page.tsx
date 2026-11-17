import type { Metadata } from 'next';
import Link from 'next/link';
import { agenciesWaitingFor } from '@/server/accounts/staff';
import { requireStaff } from '@/server/auth/staff';
import { Card, CardHeader, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { AgenciesWaiting } from '../AgenciesWaiting';
import { PilotAgencyForm } from './PilotAgencyForm';

export const metadata: Metadata = { title: 'Agencies' };
export const dynamic = 'force-dynamic';

const done: Record<string, string> = {
  confirmed: 'Confirmed. Its admins have been emailed, and any home that was waiting is live.',
  invited: 'The agency is set up and confirmed, and its first admin has been invited by email.',
};

/**
 * UX-AG-4, UX-AG-5 (Q32): the simple confirm action for Gaff's own team. The register is public,
 * so picking an agency proves nothing about who picked it. What is confirmed here is one thing:
 * that the person who claimed the agency works there. The same list is on the internal page
 * itself (`/internal`); this page adds setting up a pilot agency.
 *
 * This page shows the agency, its entry in the register and who claimed it, and nothing else:
 * no letting, no renter, no message. Staff confirm an agency and do nothing in it (Q13).
 */
export default async function AgenciesPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; problem?: string }>;
}) {
  const staff = await requireStaff();
  const [waiting, query] = await Promise.all([agenciesWaitingFor(staff), searchParams]);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow="Gaff internal"
        title="Agencies"
        lead="Agencies that signed up by themselves wait here until someone at Gaff confirms that the person who claimed them works there."
      />
      <p>
        <Link href="/internal">Back to Gaff internal</Link>
      </p>
      {query.done && done[query.done] ? (
        <Notice tone="success" role="status">
          <p>{done[query.done]}</p>
        </Notice>
      ) : null}
      {query.problem === 'confirm' ? (
        <Notice tone="warning" role="alert">
          <p>
            That agency couldn’t be confirmed. Its licence may be off the register, or another
            confirmed agency may hold it.
          </p>
        </Notice>
      ) : null}

      <AgenciesWaiting waiting={waiting} back="agencies" />

      <Card labelledBy="pilot-agency">
        <CardHeader
          id="pilot-agency"
          title="Set up a pilot agency"
          description="For an agency you’ve invited: it arrives confirmed, and its first admin answers no set-up questions. The invitation is the confirmation."
        />
        <PilotAgencyForm />
      </Card>
    </Stack>
  );
}
