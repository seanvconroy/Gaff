import { Mail, UserRound, UserRoundPlus } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { problemWords, teamCopy } from '@/copy/team';
import { requireMember } from '@/server/auth/member';
import { teamFor } from '@/server/team/team';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { ButtonLink } from '@/ui/Button';
import { PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { answerRequestAction } from './actions';
import { InviteMenu } from './InviteMenu';
import styles from './team.module.css';

export const metadata: Metadata = { title: teamCopy.metaTitle };

const copy = teamCopy;

const doneWords: Record<string, string> = {
  'sent-again': copy.done.sentAgain,
  cancelled: copy.done.cancelled,
  added: copy.done.added,
  declined: copy.done.declined,
  gone: copy.done.gone,
};

/**
 * Team (UX-AG-8 to UX-AG-12, UX-AG-3): who's on the team, with their role and what they lead;
 * the invites waiting, with "Send again" and "Cancel"; and anyone who has asked to join, to say
 * yes or no to. "Invite a colleague" is the one primary action, for an admin. An agent sees the
 * same list and changes none of it. A private landlord's own homes have no team (UX-AG-10).
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; problem?: string }>;
}) {
  const { done, problem } = await searchParams;
  const member = await requireMember();
  const team = await teamFor(member);
  if (!team) notFound();
  const now = new Date();
  const manage = team.canManage;
  const problemText = problemWords(problem);

  return (
    <Stack gap={8}>
      <PageHeader
        title={copy.title}
        lead={copy.lead(member.organisationName)}
        actions={
          manage ? (
            <ButtonLink href="/settings/team/invite" variant="primary" fullWidth="phone">
              {copy.invite}
            </ButtonLink>
          ) : undefined
        }
      />
      {done && doneWords[done] ? (
        <Notice tone="success" role="status">
          <p>{doneWords[done]}</p>
        </Notice>
      ) : null}
      {problemText ? (
        <Notice tone="warning" role="alert">
          <p>{problemText}</p>
        </Notice>
      ) : null}

      {team.requests.length > 0 ? (
        <section className={styles.section} aria-labelledby="requests-heading">
          <h2 id="requests-heading" className="type-title">
            {copy.requests.title}
          </h2>
          <ActionList bare labelledBy="requests-heading">
            {team.requests.map((request) => (
              <ActionRow
                key={request.id}
                id={`request-${request.id}`}
                icon={UserRoundPlus}
                title={request.name}
                meta={copy.requests.meta(request.email, request.requestedAt, now)}
                trailing={
                  manage ? (
                    <form
                      action={answerRequestAction.bind(null, request.id)}
                      className={styles.answer}
                    >
                      <SubmitButton name="answer" value="approved" variant="secondary">
                        {copy.requests.yes}
                        <span className="visually-hidden">: {request.name}</span>
                      </SubmitButton>
                      <SubmitButton name="answer" value="declined" variant="quiet">
                        {copy.requests.no}
                        <span className="visually-hidden"> to {request.name}</span>
                      </SubmitButton>
                    </form>
                  ) : undefined
                }
              />
            ))}
          </ActionList>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="people-heading">
        <h2 id="people-heading" className="type-title">
          {copy.people}
        </h2>
        <ActionList bare labelledBy="people-heading">
          {team.members.map((person) => (
            <ActionRow
              key={person.userId}
              id={`member-${person.userId}`}
              icon={UserRound}
              href={manage ? `/settings/team/${person.userId}` : undefined}
              title={person.name}
              meta={copy.memberMeta(person.role, person.leads, person.you)}
            />
          ))}
        </ActionList>
        {manage ? null : <p className={styles.note}>{copy.agentsSee}</p>}
      </section>

      {team.invites.length > 0 ? (
        <section className={styles.section} aria-labelledby="invites-heading">
          <h2 id="invites-heading" className="type-title">
            {copy.invited.title}
          </h2>
          <ActionList bare labelledBy="invites-heading">
            {team.invites.map((invite) => (
              <ActionRow
                key={invite.id}
                id={`invite-${invite.id}`}
                icon={Mail}
                title={invite.email}
                meta={copy.invited.meta(invite.role, invite.sentAt, now)}
                trailing={
                  manage ? <InviteMenu inviteId={invite.id} email={invite.email} /> : undefined
                }
              />
            ))}
          </ActionList>
        </section>
      ) : null}
    </Stack>
  );
}
