import type { Metadata } from 'next';
import Link from 'next/link';
import { licenceTypeLabels } from '@/domain/register/parse';
import { formatDateTime } from '@/lib/format';
import { agenciesWaitingFor } from '@/server/accounts/staff';
import { requireStaff } from '@/server/auth/staff';
import { Card, CardHeader, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { confirmAgencyAction } from './actions';
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
 * that the person who claimed the agency works there. The full internal page is work package
 * WP-26.
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
        See also: <Link href="/internal/funnels">Funnels</Link>.
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

      <Stack gap={4} as="section">
        <h2 className="type-title">Waiting to be confirmed</h2>
        <p>
          Look at the agency’s own website, or ring the number it publishes, and check that the
          person below works there. Then press Confirm. It’s once per agency, ever.
        </p>
        {waiting.length === 0 ? <p>No agency is waiting.</p> : null}
        {waiting.map((agency) => (
          <Card key={agency.organisationId} labelledBy={`agency-${agency.organisationId}`}>
            <CardHeader
              id={`agency-${agency.organisationId}`}
              level={3}
              title={agency.name}
              description={`Asked ${formatDateTime(agency.askedAt)}`}
            />
            <SummaryList
              rows={[
                { label: 'Registered name', value: agency.registeredName },
                ...(agency.tradingName
                  ? [{ label: 'Trading name', value: agency.tradingName }]
                  : []),
                { label: 'Licence number', value: agency.licenceNumber },
                { label: 'Licence type', value: licenceTypeLabels[agency.licenceType] },
                { label: 'County', value: agency.county },
                {
                  label: 'Claimed by',
                  value:
                    agency.admins.map((admin) => `${admin.name} (${admin.email})`).join(', ') ||
                    'Nobody yet',
                },
              ]}
            />
            {agency.licenceTaken ? (
              <Notice tone="warning">
                <p>A confirmed agency on Gaff already holds this licence.</p>
              </Notice>
            ) : (
              <form action={confirmAgencyAction.bind(null, agency.organisationId)}>
                <SubmitButton variant="secondary" pendingLabel="Confirming…">
                  Confirm<span className="visually-hidden"> {agency.name}</span>
                </SubmitButton>
              </form>
            )}
          </Card>
        ))}
      </Stack>

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
