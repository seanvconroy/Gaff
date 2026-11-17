import { CalendarDays, CircleCheck, House } from 'lucide-react';
import type { Metadata } from 'next';
import { firstNameOf } from '@/domain/accounts/first-run';
import { awayCountsIn, awaySentence } from '@/domain/dashboard/away';
import { checklistCopy } from '@/copy/activation';
import { promptFor, suggestionsAllowed } from '@/domain/activation/prompts';
import { suggestedAction, suggestionsBuilt, type Suggestion } from '@/domain/dashboard/caught-up';
import type { SetupChecklist as Checklist } from '@/domain/dashboard/setup-checklist';
import { todayRows } from '@/domain/dashboard/today-rows';
import { chosenView, isMine, lettingsIn, todayIn, todayViews } from '@/domain/dashboard/views';
import { navCounts } from '@/domain/navigation/counts';
import { withReturn } from '@/domain/navigation/return-to';
import { formatTimeRange } from '@/lib/format';
import { setupFor, todayPromptFactsFor } from '@/server/activation/activation';
import { requireMember } from '@/server/auth/member';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';
import { SetupChecklist } from '@/ui/SetupChecklist';
import styles from '../dashboard.module.css';
import { PromptLine } from '../PromptLine';
import { TodayList } from '../TodayList';
import { ViewSwitch } from '../ViewSwitch';

export const metadata: Metadata = { title: 'Today' };

/** Adding a letting opens full screen, and closing it comes back here (UX-NV-6). */
const addALetting = withReturn('/lettings/new', '/today');

/**
 * Today (UX-HM-1 to UX-HM-11): where anyone running lettings lands, and the answer to one
 * question: what needs me? At most four blocks, in a fixed order, each only when it has
 * something in it:
 *
 * 1. the setup checklist (UX-GR-1 to UX-GR-4; `setupChecklistFor`), while setup isn't done;
 * 2. Needs you: one row per thing waiting on this person, most urgent first;
 * 3. Viewings today;
 * 4. While you were away: one sentence of what Gaff did.
 *
 * UX-HM-6: the only primary button Today ever has belongs to the setup checklist. The rows are
 * the actions. UX-HM-9: nothing here counts the person's time.
 *
 * UX-GR-5, UX-GR-6: at most one prompt, chosen by `promptFor`: the checklist while it shows,
 * otherwise one line after Needs you, or the "all caught up" line's one action. Never a banner
 * across the top, and never anything that stands in front of a task.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const member = await requireMember();
  const board = await dashboardForRequest(member);
  const { now, viewer } = board;

  // UX-HM-11: "Mine", or for an admin of a team, "Everyone".
  const views = todayViews(viewer);
  const view = chosenView((await searchParams).view, views);
  const everyone = view === 'everyone';
  const inView = (led: { leadUserId: string | null }) => everyone || isMine(led, viewer.userId);

  const rows = todayRows(todayIn(view, board.everyone, viewer, now), now);
  const needsYou = navCounts(todayIn(view, board.everyone, viewer, now)).today;
  const viewings = board.viewingsToday.filter(inView);
  const homes = lettingsIn(view, board.lettings, viewer);
  const homeIds = new Set(homes.map((home) => home.id));
  const away = awaySentence(
    awayCountsIn(board.away.byLetting, (id) => id === null || homeIds.has(id)),
    board.away.since,
    now,
  );
  // Each row's lead, for "Everyone" (UX-HM-11). The person's own rows say "You".
  const leads = new Map(
    board.members.map((m) => [
      m.userId,
      { name: m.name, label: m.userId === viewer.userId ? 'You' : m.name },
    ]),
  );

  // Block 1: the setup checklist, with Today's one primary button (UX-GR-1, UX-HM-6).
  const [setup, promptFacts] = await Promise.all([setupFor(member), todayPromptFactsFor(member)]);
  const { checklist } = setup;
  const firstVisit = board.lettings.length === 0;
  // UX-GR-5: one prompt at most. While the checklist shows, it is the prompt.
  const prompt = promptFor(
    'today',
    {
      viewer,
      checklistShowing: checklist !== null,
      unknownHomeEnquiries: board.everyone
        .filter((item) => item.kind === 'attention')
        .reduce((total, item) => total + ('count' in item ? item.count : 0), 0),
      homes: board.lettings.map((home) => ({
        id: home.id,
        addressLine1: home.addressLine1,
        status: home.status,
        leadUserId: home.leadUserId,
        answered: home.undecided,
        viewingTimesAhead: home.viewingTimesAhead,
      })),
      inviteSent: setup.inviteSent,
      approveBeforeSend: promptFacts.approveBeforeSend,
      recentApprovals: promptFacts.recentApprovals,
    },
    promptFacts.declines,
    now,
  );
  // UX-HM-7: with nothing in the table to offer, "all caught up" may offer one action.
  const suggestion =
    prompt === null
      ? suggestedAction(
          {
            setupUnfinished: checklist !== null,
            organisationKind: viewer.organisationKind,
            members: viewer.members,
            lettings: homes,
          },
          suggestionsAllowed(suggestionsBuilt, promptFacts.declines, now),
        )
      : null;

  return (
    <Stack gap={8}>
      <PageHeader
        title="Today"
        lead={
          rows.length > 0 ? (
            // The screen's one accent: how many things need this person.
            <>
              <span className={styles.accent}>
                {needsYou} {needsYou === 1 ? 'thing' : 'things'}
              </span>{' '}
              {everyone
                ? // Some of these wait on a colleague, so they don't all "need you".
                  `${needsYou === 1 ? 'is' : 'are'} waiting.`
                : `${needsYou === 1 ? 'needs' : 'need'} you.`}
            </>
          ) : firstVisit ? (
            `Hello, ${firstNameOf(member.name)}.`
          ) : undefined
        }
      />

      {views.length > 1 ? <ViewSwitch path="/today" view={view} label="Whose tasks" /> : null}

      {checklist ? (
        <SetupChecklistCard
          checklist={checklist}
          ownHome={viewer.organisationKind === 'private_landlord'}
        />
      ) : setup.justFinished ? (
        <p role="status">{checklistCopy.allSet}</p>
      ) : null}

      {rows.length > 0 ? (
        <section className={styles.block} aria-labelledby="needs-you-heading">
          <h2 id="needs-you-heading" className="type-title">
            {everyone ? 'Waiting' : 'Needs you'}
          </h2>
          <TodayList
            rows={rows}
            leads={everyone ? leads : undefined}
            bare
            labelledBy="needs-you-heading"
          />
        </section>
      ) : firstVisit && checklist ? null : firstVisit ? (
        // UX-GR-4: someone with no checklist opens on "Add a letting".
        <EmptyState
          icon={House}
          title={
            viewer.organisationKind === 'private_landlord'
              ? 'Add the home you’re letting'
              : 'Add your first letting'
          }
          action={<SuggestedAction suggestion={{ kind: 'add_letting' }} viewer={viewer} />}
        >
          <p>
            It takes about ten minutes. Then Gaff answers every enquiry, and anything that needs you
            shows here.
          </p>
        </EmptyState>
      ) : (
        // UX-HM-7: one line, and at most one suggested action (or the prompt below it).
        <EmptyState
          icon={CircleCheck}
          title="You’re all caught up"
          action={
            suggestion ? <SuggestedAction suggestion={suggestion} viewer={viewer} /> : undefined
          }
        />
      )}

      <PromptLine prompt={prompt} back="/today" />

      {viewings.length > 0 ? (
        <section className={styles.block} aria-labelledby="viewings-today-heading">
          <h2 id="viewings-today-heading" className="type-title">
            Viewings today
          </h2>
          <ActionList bare labelledBy="viewings-today-heading">
            {viewings.map((viewing) => (
              <ActionRow
                key={viewing.sessionId}
                id={`viewing-${viewing.sessionId}`}
                // UX-VW-6, UX-VW-10: the viewing's own sheet, which offers "Mark who came".
                href={`/calendar?viewing=${viewing.sessionId}`}
                icon={CalendarDays}
                title={`${formatTimeRange(viewing.startsAt, viewing.endsAt)} · ${viewing.address}`}
                meta={`${viewing.booked} of ${viewing.places} booked`}
              />
            ))}
          </ActionList>
        </section>
      ) : null}

      {away ? (
        // UX-HM-8: one sentence, from counts only. It links to nothing.
        <section className={styles.block} aria-labelledby="away-heading">
          <h2 id="away-heading" className="type-title">
            While you were away
          </h2>
          <p className={styles.away}>{away}</p>
        </section>
      ) : null}
    </Stack>
  );
}

/**
 * UX-HM-7: the one suggested action, as a quiet button. It is never the primary button: that
 * belongs to the setup checklist (UX-HM-6).
 */
function SuggestedAction({
  suggestion,
  viewer,
}: {
  suggestion: Suggestion;
  viewer: { organisationKind: string };
}) {
  switch (suggestion.kind) {
    case 'add_letting':
      return (
        <ButtonLink href={addALetting} variant="secondary">
          {viewer.organisationKind === 'private_landlord' ? 'Add your home' : 'Add a letting'}
        </ButtonLink>
      );
    case 'add_viewing_times':
      return (
        <ButtonLink href={`/lettings/${suggestion.lettingId}/viewings`} variant="secondary">
          {/* The address is in the link's name, not on its face: a button is one line (UX-DS-13). */}
          Add viewing times<span className="visually-hidden"> for {suggestion.address}</span>
        </ButtonLink>
      );
    case 'invite_colleague':
      return (
        <ButtonLink href={withReturn('/settings/team/invite', '/today')} variant="secondary">
          Invite a colleague
        </ButtonLink>
      );
    // The checklist above is the way to finish setup: nothing is said twice.
    case 'finish_setup':
      return null;
  }
}

/** UX-GR-1: the checklist card. Its next step's button is Today's one primary button. */
function SetupChecklistCard({ checklist, ownHome }: { checklist: Checklist; ownHome: boolean }) {
  const who = { ownHome, portals: checklist.portals };
  const next = checklistCopy.step(checklist.next.code, who);
  return (
    <SetupChecklist
      title={checklistCopy.title}
      done={checklist.done}
      total={checklist.total}
      steps={checklist.steps.map((step) => ({
        name: checklistCopy.listName(step.code, who),
        done: step.done,
      }))}
      next={{
        name: next.name,
        why: next.why,
        action: (
          <ButtonLink href={checklist.next.href} variant="primary" fullWidth="phone">
            {next.action}
          </ButtonLink>
        ),
      }}
    />
  );
}
