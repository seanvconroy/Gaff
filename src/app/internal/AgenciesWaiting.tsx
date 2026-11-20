import { licenceTypeLabels } from '@/domain/register/parse';
import { formatDateTime } from '@/lib/format';
import type { AgencyWaiting } from '@/server/accounts/staff';
import { Card, CardHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { confirmAgencyAction } from './agencies/actions';

/**
 * UX-AG-4 (Q32): the agencies waiting for someone at Gaff to confirm that the person who
 * claimed them works there, with Confirm. On the internal page, and on Agencies beside the
 * pilot set-up. It shows the agency, its entry in the register and who claimed it: no letting,
 * no renter, no message.
 */
export function AgenciesWaiting({
  waiting,
  back,
}: {
  waiting: readonly AgencyWaiting[];
  /** Which page Confirm returns to. */
  back: 'internal' | 'agencies';
}) {
  return (
    <Stack gap={4} as="section">
      <h2 className="type-title" id="agencies">
        Agencies waiting to be confirmed
      </h2>
      <p>
        Look at the agency’s own website, or ring the number it publishes, and check that the person
        below works there. Then press Confirm. It’s once per agency, ever.
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
              ...(agency.tradingName ? [{ label: 'Trading name', value: agency.tradingName }] : []),
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
              <input type="hidden" name="back" value={back} />
              <SubmitButton variant="secondary" pendingLabel="Confirming…">
                Confirm<span className="visually-hidden"> {agency.name}</span>
              </SubmitButton>
            </form>
          )}
        </Card>
      ))}
    </Stack>
  );
}
