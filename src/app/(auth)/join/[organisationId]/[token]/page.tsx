import type { Metadata } from 'next';
import { sendsRealEmail } from '@/adapters/email';
import { env } from '@/lib/env';
import { currentUser } from '@/server/auth/member';
import { openInvitation } from '@/server/organisations/team';
import { SignInForm } from '@/app/(auth)/sign-in/SignInForm';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { joinAction } from './actions';

export const metadata: Metadata = { title: 'Join your team' };
export const dynamic = 'force-dynamic';

/** M16: where an invitation link lands. Sign in first if needed, then join in one tap. */
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

  return (
    <Stack gap={8}>
      {!invitation ? (
        <>
          <PageHeader title="This invitation has expired" />
          <p>Invitations work once, for 7 days. Ask whoever invited you to send a new one.</p>
        </>
      ) : (
        <>
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
                You’re already on another team on Gaff. Sign in with a different email to join this
                one.
              </p>
            </Notice>
          ) : null}
          {user ? (
            <form action={joinAction.bind(null, organisationId, token)}>
              <SubmitButton pendingLabel="Joining…">
                Join {invitation.organisationName}
              </SubmitButton>
            </form>
          ) : (
            <Stack gap={4}>
              <p>First, sign in with your work email. There’s no password.</p>
              <SignInForm
                devOutbox={env().DEV_TOOLS && !sendsRealEmail()}
                next={`/join/${organisationId}/${token}`}
              />
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
