import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { firstRunCopy } from '@/copy/first-run';
import {
  type FirstRunStep,
  firstNameOf,
  landingFor,
  nameIsKnown,
  nextStep,
  purposeFromNext,
  stepsFor,
} from '@/domain/accounts/first-run';
import { safeNextPath } from '@/domain/auth/next-path';
import { currentContext, homeFor, lookAroundHref } from '@/domain/navigation/context';
import { licenceTypeLabels } from '@/domain/register/parse';
import { agencyNameFrom, searchTerms } from '@/domain/register/search';
import {
  findRegisterEntry,
  pendingJoinRequests,
  type RegisterResult,
  searchRegister,
} from '@/server/accounts/agencies';
import { currentUser, holdingsOf } from '@/server/auth/member';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { ButtonLink } from '@/ui/Button';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Card } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { askToJoinAction, claimAgencyAction } from './actions';
import { welcomeHref } from './href';
import {
  AgencySearchField,
  ApplyingStep,
  type Frame,
  LicenceStep,
  NameStep,
  PurposeStep,
} from './Steps';
import styles from './welcome.module.css';

export const metadata: Metadata = { title: 'Getting started' };

const copy = firstRunCopy;
const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

/**
 * UX-AC-6 to UX-AC-10: first run. One question per screen, at most four, in the flow shell:
 * "What's your name?", "What brings you to Gaff?", and, for someone at an agency, "Which
 * agency?" and "Is this your agency?" (UX-AG-1 to UX-AG-4).
 *
 * Which screen opens is worked out here, every time, from what is already known: the name on
 * the profile, where the person was going when they signed in (`next`), and how far they got
 * last time, which their profile remembers. So they can leave at any step and come back to it
 * (UX-AC-10), and a question whose answer is known is never asked (the rules are in
 * src/domain/accounts/first-run.ts).
 *
 * Someone who already has a context comes here only from the account menu's "Join or set up an
 * agency" (UX-AC-13), which starts at the step it needs.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const query = await searchParams;
  const next = safeNextPath(one(query.next));
  const asked = one(query.step);
  const named = one(query.n) === '1';

  const { profile, contexts } = await holdingsOf(user.id);
  const open = currentContext(contexts, {
    side: profile.lastSide,
    organisationId: profile.lastOrganisationId,
  });
  const nameKnown = nameIsKnown(user.name);
  const fromNext = purposeFromNext(next);
  const adding = open !== null;
  const home = open ? homeFor(open.side) : lookAroundHref;

  // What is known, and so which screen is next.
  const purpose = adding
    ? asked === 'agency' || asked === 'confirm'
      ? 'agency'
      : fromNext
    : (fromNext ?? profile.firstRunPurpose);
  // Someone who already has a context, and isn't here to add one, has nothing to answer.
  if (adding && !purpose) redirect(next ?? home);
  let step = nextStep({
    nameKnown,
    purpose,
    agencyPicked: profile.firstRunRegisterEntryId !== null || Boolean(one(query.entry)),
  });
  if (nameKnown) {
    // Back, or a link, may open a screen already reached; never one further on.
    if (asked === 'name' && named) step = 'name';
    else if (asked === 'purpose' && !fromNext && !adding) step = 'purpose';
    else if (asked === 'agency' && purpose === 'agency') step = 'agency';
  }
  // Nothing left to ask: on to where they were going. Adding a home makes the landlord's
  // organisation itself (UX-AC-4), so there is nothing to do here first.
  if (step === 'done') redirect(next ?? landingFor(purpose!));

  // The screens this person is asked, for the progress and for Back.
  const asking = stepsFor({
    nameKnown: nameKnown && !named,
    purposeKnownBefore: fromNext !== null || adding,
    purpose: step === 'agency' || step === 'confirm' ? 'agency' : purpose,
  });
  const before = asking[asking.indexOf(step) - 1];
  const backHref = before ? welcomeHref({ step: before, next, named }) : undefined;
  const frame: Frame = {
    leave: backHref
      ? { kind: 'back', href: backHref }
      : { kind: 'close', href: home, label: copy.leave },
    progress:
      asking.length > 1
        ? {
            label: copy.progress,
            segments: asking.map((each: FirstRunStep) => copy.segments[each]),
            current: asking.indexOf(step),
          }
        : undefined,
    backHref,
    next,
    named,
  };

  if (step === 'name') {
    return (
      <NameStep
        frame={frame}
        defaultName={nameKnown ? user.name : ''}
        then={purpose === 'agency' && adding ? 'agency' : undefined}
      />
    );
  }
  if (step === 'purpose') {
    const title = named
      ? copy.purpose.titleAfterName(firstNameOf(user.name))
      : asking[0] === 'purpose'
        ? copy.purpose.titleFirst
        : copy.purpose.title;
    return <PurposeStep frame={frame} title={title} />;
  }

  // "Which agency?", and the two other ways to answer it (UX-AG-2).
  const searchHref = welcomeHref({ step: 'agency', next, named });
  if (step === 'agency') {
    const answering: Frame = {
      ...frame,
      leave: { kind: 'back', href: searchHref },
      backHref: searchHref,
    };
    if (one(query.by) === 'licence') return <LicenceStep frame={answering} />;
    if (one(query.by) === 'applying') return <ApplyingStep frame={answering} />;
    const typed = one(query.q).slice(0, 80);
    return (
      <AgencySearch
        frame={frame}
        typed={typed}
        results={await searchRegister(typed)}
        searched={searchTerms(typed).length > 0}
      />
    );
  }

  // "Is this your agency?"
  const entryId = one(query.entry) || profile.firstRunRegisterEntryId || '';
  const entry = await findRegisterEntry(entryId);
  if (!entry) redirect(searchHref);
  const answering: Frame = {
    ...frame,
    leave: { kind: 'back', href: searchHref },
    backHref: searchHref,
  };
  // UX-AG-3: they have already asked to join this one. The request waits with its admins.
  const askedToJoin =
    entry.onGaff &&
    profile.firstRunRegisterEntryId === entry.id &&
    (await pendingJoinRequests(user.id)).length > 0;
  if (askedToJoin) {
    return (
      <Asked frame={answering} agencyName={agencyNameFrom(entry)} home={home} adding={adding} />
    );
  }
  return <ConfirmAgency frame={answering} entry={entry} />;
}

function AgencySearch({
  frame,
  typed,
  results,
  searched,
}: {
  frame: Frame;
  typed: string;
  results: RegisterResult[];
  searched: boolean;
}) {
  return (
    <FlowShell
      leave={frame.leave}
      progress={frame.progress}
      back={
        frame.backHref ? (
          <ButtonLink href={frame.backHref} variant="quiet">
            {copy.back}
          </ButtonLink>
        ) : undefined
      }
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.agency.searching}>
          {copy.agency.search}
        </SubmitButton>
      }
      form={{ action: '/welcome', method: 'get', role: 'search' }}
    >
      <FlowTitle title={copy.agency.title} lead={copy.agency.lead} />
      <input type="hidden" name="step" value="agency" />
      {frame.named ? <input type="hidden" name="n" value="1" /> : null}
      {frame.next ? <input type="hidden" name="next" value={frame.next} /> : null}
      <AgencySearchField typed={typed} next={frame.next} named={frame.named} />
      <div className={styles.results}>
        {/* Screen readers hear how many were found each time the list changes. */}
        <p className="visually-hidden" role="status">
          {searched ? copy.agency.found(results.length) : ''}
        </p>
        {results.length > 0 ? (
          <Card as="div">
            <ActionList flush>
              {results.map((result) => (
                <ActionRow
                  key={result.id}
                  id={`agency-${result.licenceNumber}`}
                  href={welcomeHref({
                    step: 'confirm',
                    entry: result.id,
                    next: frame.next,
                    named: frame.named,
                  })}
                  icon={Building2}
                  title={agencyNameFrom(result)}
                  meta={[
                    result.tradingName ? copy.agency.registeredAs(result.registeredName) : null,
                    result.county,
                    copy.agency.licence(result.licenceNumber),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    result.onGaff ? <StatusPill tone="info">{copy.agency.onGaff}</StatusPill> : null
                  }
                />
              ))}
            </ActionList>
          </Card>
        ) : searched ? (
          <p>{copy.agency.none(typed)}</p>
        ) : null}
        {searched ? (
          <>
            <ul className={styles.otherWays}>
              <li>
                <Link
                  className={styles.way}
                  href={welcomeHref({ step: 'agency', by: 'licence', named: frame.named })}
                >
                  {copy.agency.byLicence}
                </Link>
              </li>
              <li>
                <Link
                  className={styles.way}
                  href={welcomeHref({ step: 'agency', by: 'applying', named: frame.named })}
                >
                  {copy.agency.applying}
                </Link>
              </li>
            </ul>
            <p className={styles.credit}>{copy.agency.credit}</p>
          </>
        ) : null}
      </div>
    </FlowShell>
  );
}

function ConfirmAgency({ frame, entry }: { frame: Frame; entry: RegisterResult }) {
  const rows = copy.confirm.rows;
  return (
    <FlowShell
      leave={frame.leave}
      progress={frame.progress}
      back={
        <ButtonLink href={frame.backHref!} variant="quiet">
          {copy.confirm.no}
        </ButtonLink>
      }
      primary={
        entry.onGaff ? (
          <SubmitButton fullWidth="phone" pendingLabel={copy.confirm.asking}>
            {copy.confirm.askToJoin}
          </SubmitButton>
        ) : (
          <SubmitButton fullWidth="phone" pendingLabel={copy.saving}>
            {copy.confirm.yes}
          </SubmitButton>
        )
      }
      form={{ action: entry.onGaff ? askToJoinAction : claimAgencyAction }}
    >
      <FlowTitle title={copy.confirm.title} />
      <input type="hidden" name="entry" value={entry.id} />
      <Card as="div">
        <SummaryList
          rows={[
            { label: rows.registeredName, value: entry.registeredName },
            ...(entry.tradingName ? [{ label: rows.tradingName, value: entry.tradingName }] : []),
            { label: rows.licenceNumber, value: entry.licenceNumber },
            { label: rows.licenceType, value: licenceTypeLabels[entry.licenceType] },
            { label: rows.county, value: entry.county },
          ]}
        />
      </Card>
      {entry.onGaff ? (
        <Notice tone="info" title={copy.confirm.onGaff(agencyNameFrom(entry))}>
          <p>{copy.confirm.onGaffNext}</p>
        </Notice>
      ) : null}
      <p className={styles.credit}>{copy.agency.credit}</p>
    </FlowShell>
  );
}

/** UX-AG-3: they've asked to join. The request waits with the agency's admins (WP-19). */
function Asked({
  frame,
  agencyName,
  home,
  adding,
}: {
  frame: Frame;
  agencyName: string;
  home: string;
  adding: boolean;
}) {
  return (
    <FlowShell
      leave={{ kind: 'close', href: home, label: copy.leave }}
      back={
        adding ? undefined : (
          <ButtonLink href={welcomeHref({ step: 'purpose', named: frame.named })} variant="quiet">
            {copy.asked.somethingElse}
          </ButtonLink>
        )
      }
      primary={
        <ButtonLink href={home} variant="primary" fullWidth="phone">
          {copy.asked.lookAround}
        </ButtonLink>
      }
    >
      <Outcome tone="waiting" title={copy.asked.title(agencyName)} headingLevel={1}>
        <p>{copy.asked.text}</p>
      </Outcome>
    </FlowShell>
  );
}
