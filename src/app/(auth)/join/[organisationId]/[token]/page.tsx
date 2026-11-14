import type { Metadata } from 'next';
import { SignInForm } from '@/app/(auth)/sign-in/SignInForm';
import { invitationIsFor } from '@/domain/organisations/invitation';
import { currentUser } from '@/server/auth/member';
import { openInvitation } from '@/server/organisations/team';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { ProviderButtons } from '../../../ProviderButtons';
import { joinAction, useInvitedEmailAction } from './actions';

export const metadata: Metadata = { title: 'Join your team' };
export const dynamic = 'force-dynamic';

/**
 * M16, AU9: where an invitation link lands. The invitation is for the address it was sent to:
 * sign in with that email, any way you like, then join in one tap. The link itself signs
 * nobody in, so a forwarded one lets nobody else onto the team.
 */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ organisationId: string; token: string }>;
  searchParams: Promise<{ problem?: string }>;
}) {
  const { organisationId, token } = await params;
  const { problem } = await searchParams;
  const invitation = await openInvitation(organisationId, token);
  const user = await currentUser();
  const here = `/join/${organisationId}/${token}`;

  if (!invitation?.email) {
    return (
      <Stack gap={8}>
        <PageHeader title="This invitation has expired" />
        <p>
          Invitations work once, for 7 days, and a newer one replaces an older one. Ask whoever
          invited you to send it again.
        </p>
      </Stack>
    );
  }

  const forThem = user ? invitationIsFor(invitation.email, user) : false;
  return (
    <Stack gap={8}>
      <PageHeader
        title={`Join ${invitation.organisationName} on Gaff`}
        lead={
          invitation.role === 'admin'
            ? 'You’ll let homes with your colleagues, and manage the team and settings.'
            : 'You’ll let homes and handle enquiries with your colleagues.'
        }
      />
      {problem === 'other_team' ? (
        <Notice tone="warning" role="alert">
          <p>
            You’re already on another team on Gaff, and an account belongs to one team for now. Ask
            an admin there to remove you first, then open this invitation again.
          </p>
        </Notice>
      ) : null}
      {!user ? (
        <Stack gap={6}>
          <p>
            This invitation is for <strong>{invitation.email}</strong>. Sign in with that address to
            join. If you’re new to Gaff, the code we email you sets up your account.
          </p>
          <ProviderButtons next={here} passkeys />
          <SignInForm next={here} fixedEmail={invitation.email} password={false} />
        </Stack>
      ) : forThem ? (
        <form action={joinAction.bind(null, organisationId, token)}>
          <SubmitButton pendingLabel="Joining…">Join {invitation.organisationName}</SubmitButton>
        </form>
      ) : (
        <Stack gap={4}>
          <Notice tone="warning" role="alert">
            <p>
              This invitation is for {invitation.email}, and you’re signed in as {user.email}. Sign
              in as {invitation.email} to join, or ask whoever invited you to send it to{' '}
              {user.email} instead.
            </p>
          </Notice>
          <form action={useInvitedEmailAction.bind(null, organisationId, token)}>
            <SubmitButton pendingLabel="Signing out…">
              Sign out and use {invitation.email}
            </SubmitButton>
          </form>
        </Stack>
      )}
    </Stack>
  );
}
