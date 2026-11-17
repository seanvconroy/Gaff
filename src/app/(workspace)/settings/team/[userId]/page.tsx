import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { problemWords, teamCopy } from '@/copy/team';
import { roleLabels } from '@/domain/team/permissions';
import { formatDate } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { memberDetail, teamFor } from '@/server/team/team';
import { ButtonLink } from '@/ui/Button';
import { ChoiceGroup } from '@/ui/Field';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { roleAction } from '../actions';
import styles from '../team.module.css';

export const metadata: Metadata = { title: teamCopy.metaTitle };

const copy = teamCopy.member;
const roleOptions = teamCopy.inviteFlow.roles;

/**
 * One member, opened from Team by an admin: their role, which can be changed, what they lead,
 * and "Remove from {agency}" (UX-AG-15). The last admin's role can't be changed and they can't
 * be removed until someone else is made admin (UX-AG-16); the page says so.
 */
export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ done?: string; problem?: string }>;
}) {
  const { userId } = await params;
  const { done, problem } = await searchParams;
  const member = await requireMember();
  const [team, person] = await Promise.all([teamFor(member), memberDetail(member, userId)]);
  if (!team?.canManage || !person) notFound();
  const problemText = problemWords(problem);

  return (
    <Stack gap={8}>
      <PageHeader
        back={{ href: '/settings/team', label: copy.back }}
        title={person.name}
        lead={roleLabels[person.role]}
      />
      {done === 'role' ? (
        <Notice tone="success" role="status">
          <p>{teamCopy.done.role}</p>
        </Notice>
      ) : null}
      {problemText ? (
        <Notice tone="warning" role="alert">
          <p>{problemText}</p>
        </Notice>
      ) : null}
      <Narrow>
        <Stack gap={8}>
          <SummaryList
            rows={[
              { label: copy.email, value: person.email },
              { label: copy.joined, value: formatDate(person.joinedAt) },
              {
                label: copy.leads,
                value:
                  person.lettings.length === 0
                    ? copy.leadsNone
                    : copy.leadsSome(person.lettings.length),
              },
            ]}
          />
          <section className={styles.section} aria-labelledby="role-heading">
            <h2 id="role-heading" className="type-title">
              {copy.changeRole}
            </h2>
            <form action={roleAction.bind(null, person.userId)}>
              <Stack gap={4}>
                <ChoiceGroup
                  name="role"
                  legend={copy.role}
                  hint={
                    person.role === 'admin' ? (person.cantStopBeingAdmin ?? undefined) : undefined
                  }
                  defaultValue={person.role}
                  options={(['negotiator', 'admin'] as const).map((role) => ({
                    value: role,
                    label: roleOptions[role].label,
                    hint: roleOptions[role].hint,
                  }))}
                />
                <div>
                  <SubmitButton variant="secondary" pendingLabel={copy.saving}>
                    {copy.saveRole}
                  </SubmitButton>
                </div>
              </Stack>
            </form>
          </section>
          {person.you ? null : person.cantRemove ? (
            <p className={styles.note}>{person.cantRemove}</p>
          ) : (
            <div>
              <ButtonLink
                href={`/settings/team/${person.userId}/remove`}
                variant="destructive"
                fullWidth="phone"
              >
                {copy.remove(member.organisationName)}
              </ButtonLink>
            </div>
          )}
        </Stack>
      </Narrow>
    </Stack>
  );
}
