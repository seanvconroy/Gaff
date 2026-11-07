import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { requireStaff } from '@/server/auth/staff';
import { licenceQueue } from '@/server/verification/licence';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { Table } from '@/ui/Table';
import { decideAction } from './actions';

export const metadata: Metadata = { title: 'Licence checks' };

/**
 * M105: PSRA licences waiting for a person. The reviewer looks each one up on the public
 * register and records what they found. Target: within one working day (M23).
 */
export default async function StaffChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const staff = await requireStaff();
  const queue = await licenceQueue(staff);

  return (
    <Stack gap={8}>
      <PageHeader
        title="Licence checks"
        lead="Look each licence up on the PSRA public register. The number and the name must both match."
      />
      <p>
        <a href="https://www.psr.ie/" target="_blank" rel="noreferrer noopener">
          Open the PSRA register (opens in a new tab)
        </a>
      </p>
      {saved ? (
        <Notice tone="success" role="status">
          <p>Recorded, and the letter has been emailed.</p>
        </Notice>
      ) : null}
      {queue.length === 0 ? (
        <p>Nothing waiting. Every licence has been checked.</p>
      ) : (
        <Table
          caption="Licences waiting"
          head={['Licence', 'Whose', 'Name to match', 'Waiting since', 'Decision']}
        >
          {queue.map((item) => (
            <tr key={item.checkId}>
              <td>{item.licenceNumber}</td>
              <td>
                {item.agentName ? `Agent at ${item.organisationName}` : item.organisationName}
              </td>
              <td>{item.agentName ?? item.legalName ?? item.organisationName}</td>
              <td>{formatDateTime(item.waitingSince)}</td>
              <td>
                <form action={decideAction.bind(null, item.checkId)}>
                  <Row>
                    <SubmitButton
                      variant="secondary"
                      name="decision"
                      value="passed"
                      pendingLabel="Saving…"
                    >
                      Matches the register
                    </SubmitButton>
                    <SubmitButton
                      variant="quiet"
                      name="decision"
                      value="name_differs"
                      pendingLabel="Saving…"
                    >
                      Name differs
                    </SubmitButton>
                    <SubmitButton
                      variant="quiet"
                      name="decision"
                      value="not_current"
                      pendingLabel="Saving…"
                    >
                      Not current
                    </SubmitButton>
                    <SubmitButton
                      variant="quiet"
                      name="decision"
                      value="not_found"
                      pendingLabel="Saving…"
                    >
                      Not on the register
                    </SubmitButton>
                  </Row>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Stack>
  );
}
