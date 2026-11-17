import { CalendarDays, CircleCheck, House } from 'lucide-react';
import type { Metadata } from 'next';
import { firstNameOf } from '@/domain/accounts/first-run';
import { awayCountsIn, awaySentence } from '@/domain/dashboard/away';
import { suggestedAction, type Suggestion } from '@/domain/dashboard/caught-up';
import { setupChecklistFor } from '@/domain/dashboard/setup-checklist';
import { todayRows } from '@/domain/dashboard/today-rows';
import { chosenView, isMine, lettingsIn, todayIn, todayViews } from '@/domain/dashboard/views';
import { navCounts } from '@/domain/navigation/counts';
import { withReturn } from '@/domain/navigation/return-to';
import { formatTimeRange } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { dashboardForRequest } from '@/server/dashboard/dashboard';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { PageHeader, Stack } from '@/ui/Layout';
import styles from '../dashboard.module.css';
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
 * 1. the setup checklist (work package WP-27; see `setupChecklistFor`);
 * 2. Needs you: one row per thing waiting on this person, most urgent first;
 * 3. Viewings today;
 * 4. While you were away: one sentence of what Gaff did.
 *
 * UX-HM-6: the only primary button Today ever has belongs to the setup checklist, so today
 * there is none. The rows are the actions. UX-HM-9: nothing here counts the person's time.
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

  // Block 1 (WP-27): the setup checklist, with Today's one primary button. Nobody has one yet.
  const checklist = setupChecklistFor({ userId: viewer.userId });
  const firstVisit = board.lettings.length === 0;
  const suggestion = suggestedAction({
    setupUnfinished: checklist !== null,
    organisationKind: viewer.organisationKind,
    members: viewer.members,
    lettings: homes,
  });

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

      {/* Block 1: the setup checklist goes here, when WP-27 builds it. */}

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
      ) : firstVisit ? (
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
        // UX-HM-7: one line, and at most one suggested action.
        <EmptyState
          icon={CircleCheck}
          title="You’re all caught up"
          action={
            suggestion ? <SuggestedAction suggestion={suggestion} viewer={viewer} /> : undefined
          }
        />
      )}

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
                href={`/lettings/${viewing.lettingId}/attendance`}
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
    // Built by later packages: finishing setup (WP-27) and inviting a colleague (WP-19). The
    // rule doesn't offer them until then (`suggestionsBuilt`).
    case 'finish_setup':
    case 'invite_colleague':
      return null;
  }
}
