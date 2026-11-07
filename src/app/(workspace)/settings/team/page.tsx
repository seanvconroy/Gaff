import type { Metadata } from 'next';
import { requireMember } from '@/server/auth/member';
import { teamMembers } from '@/server/organisations/team';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { Table } from '@/ui/Table';
import { removeAction } from './actions';
import { InviteForm } from './InviteForm';

export const metadata: Metadata = { title: 'Team' };

const licenceWords = {
  passed: { tone: 'success', words: 'Checked' },
  pending: { tone: 'info', words: 'Waiting for the check' },
  needs_review: { tone: 'info', words: 'Waiting for the check' },
  failed: { tone: 'warning', words: 'Not passed' },
} as const;

/** M16: the agency is the parent of its agents: who's on the team, and inviting more. */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const { saved, problem } = await searchParams;
  const member = await requireMember();
  const team = await teamMembers(member);
  const isAdmin = member.role === 'admin';

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Team"
        lead="Homes, enquiries and records belong to the team, so they stay when someone leaves."
      />
      {saved === 'removed' ? (
        <Notice tone="success" role="status">
          <p>They’ve been removed from the team.</p>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="warning" role="alert">
          <p>
            That didn’t work. The team needs at least one admin, and only admins can remove people.
          </p>
        </Notice>
      ) : null}
      <Table
        caption="Your team"
        head={[
          'Name',
          'Email',
          'Role',
          ...(member.organisationKind === 'agency' ? ['PSRA licence'] : []),
          ...(isAdmin ? [''] : []),
        ]}
      >
        {team.map((person) => (
          <tr key={person.userId}>
            <td>{person.name}</td>
            <td>{person.email}</td>
            <td>{person.role === 'admin' ? 'Admin' : 'Agent'}</td>
            {member.organisationKind === 'agency' ? (
              <td>
                {person.licenceStatus ? (
                  <StatusPill tone={licenceWords[person.licenceStatus].tone}>
                    {person.licenceNumber} · {licenceWords[person.licenceStatus].words}
                  </StatusPill>
                ) : (
                  'Not added yet'
                )}
              </td>
            ) : null}
            {isAdmin ? (
              <td>
                {person.userId !== member.userId ? (
                  <form action={removeAction.bind(null, person.userId)}>
                    <SubmitButton variant="quiet" pendingLabel="Removing…">
                      Remove {person.name}
                    </SubmitButton>
                  </form>
                ) : null}
              </td>
            ) : null}
          </tr>
        ))}
      </Table>
      {isAdmin ? (
        <Card labelledBy="invite-heading">
          <h2 id="invite-heading" className="type-title">
            Invite a colleague
          </h2>
          <InviteForm />
        </Card>
      ) : null}
    </Stack>
  );
}
