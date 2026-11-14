import type { Metadata } from 'next';
import { roleWords } from '@/domain/organisations/team-rules';
import { formatDate } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { pendingInvitations, teamMembers } from '@/server/organisations/team';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { Cell, Table } from '@/ui/Table';
import {
  cancelInvitationAction,
  changeRoleAction,
  removeAction,
  resendInvitationAction,
} from './actions';
import { InviteForm } from './InviteForm';
import styles from './team.module.css';

export const metadata: Metadata = { title: 'Team' };

const licenceWords = {
  passed: { tone: 'success', words: 'Checked' },
  pending: { tone: 'info', words: 'Waiting for the check' },
  needs_review: { tone: 'info', words: 'Waiting for the check' },
  failed: { tone: 'warning', words: 'Not passed' },
} as const;

const savedWords: Record<string, string> = {
  removed: 'They’ve been removed from the team. What they could see here ended at once.',
  role: 'Their role is changed.',
  resent: 'We’ve emailed the invitation again, with a new link. The earlier link no longer works.',
  cancelled: 'The invitation is cancelled, and its link no longer works.',
};

const problemWords: Record<string, string> = {
  remove: 'That didn’t work. The team needs at least one admin, and only admins can remove people.',
  role: 'That didn’t work. The team needs at least one admin, and only admins can change roles.',
  invite: 'That didn’t send. Only admins can change invitations, and a team can send 30 an hour.',
  gone: 'That invitation is no longer waiting. It may have been accepted or cancelled.',
};

/**
 * M16, AU9, AU10: the agency is the parent of its agents: who's on the team, their roles, and
 * inviting more. Everyone on the team sees it; only admins change it.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; problem?: string }>;
}) {
  const { saved, problem } = await searchParams;
  const member = await requireMember();
  const team = await teamMembers(member);
  const isAdmin = member.role === 'admin';
  const waiting = await pendingInvitations(member);
  const savedLine = saved ? savedWords[saved] : undefined;
  const problemLine = problem ? (problemWords[problem] ?? problemWords.remove) : undefined;

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Team"
        lead="Homes, enquiries and records belong to the team, so they stay when someone leaves."
      />
      {savedLine ? (
        <Notice tone="success" role="status">
          <p>{savedLine}</p>
        </Notice>
      ) : null}
      {problemLine ? (
        <Notice tone="warning" role="alert">
          <p>{problemLine}</p>
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
            <td>{roleWords[person.role]}</td>
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
                  <div className={styles.actions}>
                    <form
                      action={changeRoleAction.bind(
                        null,
                        person.userId,
                        person.role === 'admin' ? 'negotiator' : 'admin',
                      )}
                    >
                      <SubmitButton variant="quiet" pendingLabel="Saving…">
                        Make {person.name} {person.role === 'admin' ? 'an agent' : 'an admin'}
                      </SubmitButton>
                    </form>
                    <form action={removeAction.bind(null, person.userId)}>
                      <SubmitButton variant="quiet" pendingLabel="Removing…">
                        Remove {person.name}
                      </SubmitButton>
                    </form>
                  </div>
                ) : null}
              </td>
            ) : null}
          </tr>
        ))}
      </Table>
      {isAdmin && waiting.length > 0 ? (
        <Stack gap={3}>
          <h2 className="type-title">Invitations waiting</h2>
          <Table caption="Invitations waiting" head={['Email', 'Role', 'Link works until', '']}>
            {waiting.map((invitation) => (
              <tr key={invitation.id}>
                <Cell label="Email">{invitation.email}</Cell>
                <Cell label="Role">{roleWords[invitation.role]}</Cell>
                <Cell label="Link works until">{formatDate(invitation.expiresAt)}</Cell>
                <td>
                  <div className={styles.actions}>
                    <form action={resendInvitationAction.bind(null, invitation.id)}>
                      <SubmitButton variant="quiet" pendingLabel="Sending…">
                        Send again<span className="visually-hidden"> to {invitation.email}</span>
                      </SubmitButton>
                    </form>
                    <form action={cancelInvitationAction.bind(null, invitation.id)}>
                      <SubmitButton variant="quiet" pendingLabel="Cancelling…">
                        Cancel the invitation
                        <span className="visually-hidden"> to {invitation.email}</span>
                      </SubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Stack>
      ) : null}
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
