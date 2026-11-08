import Link from 'next/link';
import type { Metadata } from 'next';
import { isPublic, statusWords } from '@/domain/listings/lifecycle';
import { formatDate } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { listingsOverview } from '@/server/listings/manage';
import { teamMembers } from '@/server/organisations/team';
import { SelectField } from '@/ui/Field';
import { ButtonLink } from '@/ui/Button';
import { PageHeader, Row, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { Table } from '@/ui/Table';
import { reassignAction, relistAction } from './actions';

export const metadata: Metadata = { title: 'Listings' };

const statusText = (status: string) =>
  isPublic(status as never)
    ? statusWords[status as keyof typeof statusWords]
    : status === 'paused'
      ? 'Paused'
      : status === 'in_review'
        ? 'Being checked by Gaff'
        : 'Draft';

/** M91, M93, M94: every listing, its status and what needs attention. */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; problem?: string; saved?: string }>;
}) {
  const { agent, problem, saved } = await searchParams;
  const member = await requireMember();
  const rows = await listingsOverview(member, agent ? { assignedTo: agent } : {});
  const team = member.organisationKind === 'agency' ? await teamMembers(member) : [];
  const now = new Date();

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Listings"
        lead="Each home’s advert on Gaff. Enquiries from listings come into the same lists as Daft and MyHome."
        actions={
          <ButtonLink href="/developments" variant="secondary">
            Developments
          </ButtonLink>
        }
      />
      {problem ? (
        <Notice tone="warning" role="alert">
          <p>{problem}</p>
        </Notice>
      ) : null}
      {saved ? (
        <Notice tone="success" role="status">
          <p>Saved.</p>
        </Notice>
      ) : null}
      {team.length > 1 ? (
        <form method="get">
          <Row>
            <SelectField
              name="agent"
              label="Show listings handled by"
              defaultValue={agent ?? ''}
              options={[
                { value: '', label: 'Everyone' },
                ...team.map((t) => ({ value: t.userId, label: t.name })),
              ]}
            />
            <SubmitButton variant="secondary">Show</SubmitButton>
          </Row>
        </form>
      ) : null}
      {rows.length === 0 ? (
        <p>
          No listings yet. <Link href="/lettings/new">Add a home</Link>, then list it from its
          Listing page.
        </p>
      ) : (
        <Table
          caption="Listings"
          head={[
            'Home',
            'Status',
            'Enquiries',
            'Needs you',
            ...(team.length > 1 ? ['Handled by'] : []),
            '',
          ]}
        >
          {rows.map((row) => (
            <tr key={row.listingId}>
              <td>
                <Link href={`/lettings/${row.lettingId}/listing`}>{row.title}</Link>
                <br />
                {row.address}
              </td>
              <td>{statusText(row.status)}</td>
              <td>{row.enquiries}</td>
              <td>
                {row.status === 'draft'
                  ? 'Finish it and publish'
                  : row.status === 'paused'
                    ? 'Confirm it’s still available'
                    : row.confirmationDue && row.confirmationDue <= now
                      ? `Confirm it’s still available (due ${formatDate(row.confirmationDue)})`
                      : ''}
              </td>
              {team.length > 1 ? (
                <td>
                  {member.role === 'admin' ? (
                    <form action={reassignAction.bind(null, row.listingId)}>
                      <Row>
                        <SelectField
                          name="userId"
                          label={`Agent for ${row.address}`}
                          defaultValue={row.assignedTo ?? ''}
                          options={team.map((t) => ({ value: t.userId, label: t.name }))}
                        />
                        <SubmitButton variant="quiet">Reassign</SubmitButton>
                      </Row>
                    </form>
                  ) : (
                    (row.assignedName ?? '')
                  )}
                </td>
              ) : null}
              <td>
                {row.status === 'let' || row.status === 'withdrawn' ? (
                  <form action={relistAction.bind(null, row.lettingId)}>
                    <SubmitButton variant="quiet" pendingLabel="Starting…">
                      Let it again
                    </SubmitButton>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Stack>
  );
}
