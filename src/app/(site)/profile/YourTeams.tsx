'use client';

import { Building2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { teamCopy } from '@/copy/team';
import type { Role } from '@/domain/team/permissions';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { Button } from '@/ui/Button';
import { FieldError } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { useToast } from '@/ui/Toast';
import { leaveTeamAction } from './team-actions';
import styles from './teams.module.css';

const copy = teamCopy.leave;

interface Team {
  organisationId: string;
  name: string;
  role: Role;
  lastAdmin: boolean;
}

/**
 * UX-AG-17: the teams a person works in, each with "Leave {agency}". Leaving asks once, in a
 * sheet, because it can't be undone from here: an admin would have to invite them again. The
 * last admin can't leave until someone else is made admin (UX-AG-16), and the row says so.
 */
export function YourTeams({ teams }: { teams: Team[] }) {
  const [leaving, setLeaving] = useState<Team | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  if (teams.length === 0) return null;
  const close = () => {
    setLeaving(null);
    setProblem(null);
  };
  return (
    <section className={styles.teams} aria-labelledby="teams-heading">
      <div>
        <h2 id="teams-heading" className="type-title">
          {copy.title}
        </h2>
        <p className={styles.teamsLead}>{copy.lead}</p>
      </div>
      <ActionList bare labelledBy="teams-heading">
        {teams.map((team) => (
          <ActionRow
            key={team.organisationId}
            id={`team-${team.organisationId}`}
            icon={Building2}
            title={team.name}
            meta={
              team.lastAdmin ? `${copy.meta(team.role)} · ${copy.lastAdmin}` : copy.meta(team.role)
            }
            trailing={
              team.lastAdmin ? undefined : (
                <Button variant="secondary" onClick={() => setLeaving(team)}>
                  {copy.button(team.name)}
                </Button>
              )
            }
          />
        ))}
      </ActionList>
      <Sheet
        open={leaving !== null}
        onClose={close}
        title={leaving ? copy.sheetTitle(leaving.name) : ''}
        footer={
          <>
            <Button
              variant="destructive"
              fullWidth="phone"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!leaving) return;
                  const said = await leaveTeamAction(leaving.organisationId);
                  if (said) {
                    setProblem(said);
                    return;
                  }
                  toast.show({ message: copy.done(leaving.name) });
                  close();
                })
              }
            >
              {pending ? copy.leaving : copy.confirm}
            </Button>
            <Button variant="quiet" fullWidth="phone" onClick={close}>
              {copy.cancel}
            </Button>
          </>
        }
      >
        <p>{copy.sheetText}</p>
        {problem ? <FieldError id="leave-problem">{problem}</FieldError> : null}
      </Sheet>
    </section>
  );
}
