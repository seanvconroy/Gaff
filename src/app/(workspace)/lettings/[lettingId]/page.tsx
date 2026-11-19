import { Share2 } from 'lucide-react';
import type { Metadata } from 'next';
import { shareCopy } from '@/copy/owner';
import { promptFor } from '@/domain/activation/prompts';
import { homePageState } from '@/domain/homes/home-page';
import { letsOwnHomes } from '@/domain/organisations/kinds';
import { seeItOnGaffHref } from '@/domain/lettings/links';
import { figuresFor, needsYouOn, pageStage, whatsNext } from '@/domain/lettings/overview';
import { chosenChip, peopleGroup } from '@/domain/lettings/people';
import { criterionCost, poolCopy, poolSummary } from '@/copy/fit';
import { filterFromParams } from '@/domain/fit/ask';
import { screenHref } from '@/domain/lettings/links';
import { canLetAgain, canSendTestEnquiry, lettingDetailsLocked } from '@/domain/lettings/setup';
import { hasTeam, may } from '@/domain/team/permissions';
import { declinesFor } from '@/server/activation/activation';
import { goLiveGateFor } from '@/server/lettings/go-live';
import { overviewFactsFor, peopleFor } from '@/server/lettings/page';
import { poolFor } from '@/server/lettings/pool';
import { DETAILS_LOCKED } from '@/server/lettings/set-criteria';
import { env } from '@/lib/env';
import { testEnquiriesAdded } from '@/copy/test-copy';
import { lettingStandingFor } from '@/server/team/lead';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { PromptLine } from '../../PromptLine';
import { HomeView } from './HomeView';
import { LeadNotice } from './LeadNotice';
import { loadLetting } from './letting';
import { LettingHeader, type LettingView } from './LettingHeader';
import { LettingMenu } from './LettingMenu';
import { OnGaffCard } from './OnGaffCard';
import { OverviewView } from './OverviewView';
import { PeopleView } from './PeopleView';

export const metadata: Metadata = { title: 'Letting' };
export const dynamic = 'force-dynamic';

const savedCopy: Record<string, string> = {
  criteria: 'Letting details saved. Gaff will ask renters only what these need.',
  'rent-check': 'Rent check saved. It goes in the rent-setting pack.',
  comparables: 'Comparables saved for the rent-setting pack.',
  facts: 'Facts saved. Gaff answers renters from them from now on.',
  description: 'Description saved. Renters see it from now on.',
  photos: 'Photos saved.',
  live: 'Gaff is now answering enquiries for this home.',
  reminded: 'Reminder sent. The owner has a new link.',
  closed:
    'Closed. Everyone who enquired has been told, and Gaff deletes their details on schedule.',
};

const views: readonly LettingView[] = ['overview', 'people', 'home'];

/**
 * UX-MT-7, UX-MT-9: the pool summary, while people are enquiring and before anyone is invited:
 * one sentence from counts of answers, and what each criterion is costing, with the way to change
 * it for everyone. Once invitations go out the criteria lock, and the costs aren't offered.
 */
async function poolView(
  member: Parameters<typeof poolFor>[0],
  letting: { id: string; stage: string },
  stage: string,
) {
  if (stage !== 'enquiries' && stage !== 'shortlist') return null;
  const { criteria, counts } = await poolFor(member, letting.id);
  const summary = poolSummary(criteria, counts);
  if (!summary) return null;
  const open = !lettingDetailsLocked(letting.stage);
  return {
    summary,
    costs: open ? counts.costs.map((cost) => criterionCost(criteria, cost)) : [],
    change: open
      ? {
          href: screenHref(letting.id, 'details', `/lettings/${letting.id}`, { alone: '1' }),
          label: poolCopy.change,
          next: poolCopy.changeNext,
        }
      : null,
    costsLabel: poolCopy.costs,
  };
}

/**
 * A letting's page (section 4, "A letting's page", UX-LP-1 to UX-LP-13). The header, the four
 * parts, and three views that never change: Overview, People and Home (UX-LP-2). The view is in
 * the address, so Back and a reload keep it. No fact appears twice on a view (UX-LP-4).
 */
export default async function LettingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const detail = await loadLetting(params);
  const { member, letting } = detail;
  const query = await searchParams;
  const view = views.find((each) => each === query.view) ?? 'overview';
  const now = new Date();
  const { facts, recent, remindOwner } = await overviewFactsFor(member, detail, now);
  const stage = pageStage(facts);
  // UX-OW-1: a home let for someone else can be shared with its owner from the day it's added.
  const hasOwner = !letsOwnHomes(member.organisationKind);
  // UX-AG-8, UX-AG-9: who leads it, whether this member may change that, and "Help with this".
  const standing = hasTeam(member.organisationKind)
    ? await lettingStandingFor(member, letting.id)
    : null;
  // UX-LT-21, UX-TS-1: whether it has a public page, by the one rule the page itself follows.
  const { gate } = await goLiveGateFor(member);
  const shownOnGaff =
    homePageState({
      status: letting.status,
      onGaff: letting.onGaff,
      berRating: letting.berRating,
      photos: detail.photos.length,
      hiddenAt: letting.hiddenAt,
      pageRemovedAt: letting.pageRemovedAt,
      listerMayShow: gate.open,
    }) === 'live';
  const saved = query.saved && savedCopy[query.saved] ? query.saved : null;
  // UX-GR-5: one prompt at most on the letting: viewing times, then the owner's link (UX-OW-1).
  const prompt = promptFor(
    'letting',
    {
      viewer: {
        userId: member.userId,
        role: member.role,
        organisationKind: member.organisationKind,
        members: 0,
      },
      homes: [
        {
          id: letting.id,
          addressLine1: letting.addressLine1,
          status: letting.status,
          leadUserId: letting.leadUserId,
          answered: facts.answered,
          viewingTimesAhead: facts.places,
        },
      ],
      justLiveWithoutOwner: saved === 'live' && hasOwner && !letting.landlordId,
    },
    await declinesFor(member),
    now,
  );

  return (
    <Stack gap={8}>
      <LettingHeader
        letting={letting}
        stage={stage}
        cover={detail.photos[0]?.href ?? null}
        view={view}
        menu={
          <LettingMenu
            lettingId={letting.id}
            address={letting.addressLine1}
            seeOnGaff={seeItOnGaffHref({ publicRef: letting.publicRef, shownOnGaff })}
            testEnquiry={canSendTestEnquiry({ status: letting.status, enquiries: facts.enquiries })}
            shareWithOwner={hasOwner}
            shareWithColleague={
              hasTeam(member.organisationKind) && may('manage_team', { role: member.role })
            }
            changeLead={standing?.mayChangeLead ?? false}
            close={letting.status === 'live'}
            letAgain={canLetAgain(letting)}
            testEnquiries={env().DEV_TOOLS && letting.status === 'live'}
          />
        }
      />
      {standing ? (
        <LeadNotice
          lettingId={letting.id}
          leadName={standing.leadName}
          offersHelp={standing.offersHelp}
        />
      ) : null}
      {/* BA-1: what "Add test enquiries" did (development tools only). */}
      {env().DEV_TOOLS && query.added !== undefined && /^\d+$/.test(query.added) ? (
        <Notice tone="success" role="status">
          <p>{testEnquiriesAdded(Number(query.added))}</p>
        </Notice>
      ) : null}
      {saved && !(saved === 'rent-check' && detail.rentProblem) ? (
        <Notice tone="success" role="status">
          <p>{savedCopy[saved]}</p>
        </Notice>
      ) : null}
      {/* UX-OW-1: asked once, just after go-live, where Gaff doesn't know the owner yet. */}
      {prompt?.code === 'owner_follow_along' ? (
        <ActionList>
          <ActionRow
            id="share-with-owner"
            href={`/lettings/${letting.id}/owner`}
            icon={Share2}
            title={shareCopy.prompt.title}
            meta={shareCopy.prompt.text}
          />
        </ActionList>
      ) : (
        <PromptLine prompt={prompt} back={`/lettings/${letting.id}`} />
      )}

      {view === 'overview' ? (
        <OverviewView
          pool={await poolView(member, letting, stage)}
          lettingId={letting.id}
          needs={needsYouOn(facts, now)}
          figures={figuresFor(facts, now)}
          recent={recent}
          next={whatsNext(facts)}
          remindOwner={remindOwner}
          waitingOn={facts.waitingOn}
          tenancyHref={facts.tenancy ? `/lettings/${letting.id}/tenancy` : null}
          resultsHref={facts.tenancy?.finished ? `/lettings/${letting.id}/let` : null}
        />
      ) : view === 'people' ? (
        <PeopleView
          lettingId={letting.id}
          people={await peopleFor(member, letting.id)}
          group={peopleGroup(stage)}
          chip={chosenChip(query.show, peopleGroup(stage))}
          personId={query.person ?? null}
          live={letting.status !== 'draft'}
          criteria={letting.criteria ?? { noPets: false }}
          filter={filterFromParams(query)}
          declined={query.asked === 'no'}
        />
      ) : (
        <>
          <HomeView
            detail={detail}
            detailsLocked={lettingDetailsLocked(letting.stage)}
            lockedWords={DETAILS_LOCKED}
            hasOwner={hasOwner}
            shownOnGaff={shownOnGaff}
          />
          {/* UX-LT-21: the switch for "On gaff.ie", once the home is live. */}
          {letting.status === 'live' ? (
            <OnGaffCard letting={letting} photos={detail.photos.length} listerMayShow={gate.open} />
          ) : null}
        </>
      )}
    </Stack>
  );
}
