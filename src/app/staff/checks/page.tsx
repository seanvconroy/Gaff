import type { Metadata } from 'next';
import { formatDateTime } from '@/lib/format';
import { requireStaff } from '@/server/auth/staff';
import { offlineIdentityQueue } from '@/server/identity/staff';
import { licenceQueue } from '@/server/verification/licence';
import { TextField } from '@/ui/Field';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { Table } from '@/ui/Table';
import { confirmIdentityAction, decideAction } from './actions';

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
  const ids = await offlineIdentityQueue(staff);

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
          head={[
            'Licence',
            'Whose',
            'Name to match',
            'Name on their ID',
            'Waiting since',
            'Decision',
          ]}
        >
          {queue.map((item) => (
            <tr key={item.checkId}>
              <td>{item.licenceNumber}</td>
              <td>
                {item.agentName ? `Agent at ${item.organisationName}` : item.organisationName}
              </td>
              <td>{item.agentName ?? item.legalName ?? item.organisationName}</td>
              <td>{item.agentName ? (item.idName ?? 'Not checked yet') : 'Not needed'}</td>
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

      <section aria-labelledby="ids-heading">
        <Stack gap={4}>
          <h2 id="ids-heading" className="type-title">
            IDs to check another way
          </h2>
          <p>
            These letters’ IDs can’t be checked online. Contact each one within one working day, see
            the original document (Q55), and record the name on it. Never keep a copy.
          </p>
          {ids.length === 0 ? <p>Nothing waiting.</p> : null}
          {ids.map((person) => (
            <form key={person.userId} action={confirmIdentityAction.bind(null, person.userId)}>
              <Stack gap={4}>
                <p>
                  {person.name}, {person.organisationName} ({person.email}), waiting since{' '}
                  {formatDateTime(person.waitingSince)}
                </p>
                <Row>
                  <TextField name="firstName" label="First name on the ID" width="medium" />
                  <TextField name="lastName" label="Last name on the ID" width="medium" />
                </Row>
                <div>
                  <SubmitButton variant="secondary" pendingLabel="Saving…">
                    I’ve seen the original
                  </SubmitButton>
                </div>
              </Stack>
            </form>
          ))}
        </Stack>
      </section>
    </Stack>
  );
}
