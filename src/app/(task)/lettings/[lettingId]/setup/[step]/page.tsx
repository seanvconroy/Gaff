import type { Metadata } from 'next';
import { photosGoStraightToStore } from '@/server/lettings/photos';
import { notFound, redirect } from 'next/navigation';
import { addressSearch } from '@/adapters/address';
import { addLettingCopy } from '@/copy/add-letting';
import { goLiveCopy } from '@/copy/go-live';
import { lettingDetailsFormValues, lettingDetailsLine } from '@/domain/criteria/criteria';
import {
  type DraftAnswers,
  type FlowStep,
  flowSteps,
  formValuesFrom,
  missingCore,
  reviewGroups,
} from '@/domain/lettings/add-letting';
import {
  type DraftReading,
  reviewChecks,
  type SourcedField,
  sourcedFields,
} from '@/domain/lettings/advert-reading';
import { leftOutWhy } from '@/domain/compliance/who-should-apply';
import {
  type FlowScreen,
  fromOf,
  resumeHref,
  screenFromSlug,
  screenHref,
  startHref,
} from '@/domain/lettings/links';
import { availableWindow } from '@/domain/lettings/new-letting';
import { previewBer, previewFacts } from '@/domain/lettings/preview';
import { addAgencyHref } from '@/domain/navigation/account-menu';
import {
  RENT_RULES_VERSION,
  type RentAnswers,
  type RentCheckOutcome,
  rentAnswersFromCheck,
} from '@/domain/rent/rent-check';
import { pinWords } from '@/copy/map';
import { formatDate, formatRent } from '@/lib/format';
import { mapSettings } from '@/lib/map';
import { pinFor } from '@/server/lettings/location';
import type { FlowHome } from '@/server/lettings/drafts';
import { personCheckOf } from '@/server/identity/person-checks';
import { settlePersonIdentity } from '@/server/identity/provider-results';
import { goLiveStepFor } from '@/server/lettings/go-live';
import { rentAnswersFromLettingBefore } from '@/server/lettings/rent-check';
import {
  advertisedAction,
  confirmItsYouAction,
  confirmReviewAction,
  describePinAction,
  goLiveAction,
  photosChangedAction,
  photosDoneAction,
  removePhotoAction,
  reorderPhotosAction,
  rentResultAction,
  saveDetailsAction,
  saveHomePartAction,
  savePinAction,
  saveRentCheckAction,
  saveReviewAction,
  saveStepAction,
  setPhotoKindAction,
  startPhotoUploadAction,
  finishPhotoUploadAction,
  uploadPhotoAction,
} from '../../../_flow/actions';
import { AdvertisedStep } from '../../../_flow/Advertised';
import { GoLiveHeld, GoLiveStep } from '../../../_flow/GoLive';
import { GoLiveIdentity } from '../../../_flow/GoLiveIdentity';
import { flowHome } from '../../../_flow/home';
import { HomePreview } from '../../../_flow/HomePreview';
import { PinStep } from '../../../_flow/PinStep';
import { RentCheckStep, RentResultStep } from '../../../_flow/RentCheck';
import {
  type ReadingView,
  type ReviewPart,
  type ReviewRow,
  ReviewStep,
} from '../../../_flow/Review';
import {
  AddressStep,
  DescriptionStep,
  DetailsStep,
  FactsStep,
  HomeStep,
  PhotosStep,
  RentStep,
} from '../../../_flow/Steps';
import type { StepFrame } from '../../../_flow/StepForm';

export const metadata: Metadata = { title: 'Add a letting' };

const copy = addLettingCopy;

/** Which screens a home can be shown, as it stands. Anything else goes to where it left off. */
function allowed(home: FlowHome, screen: FlowScreen, alone: boolean): boolean {
  if (home.kind === 'draft') {
    // Until "Looks right", a draft that arrived filled in is changed on its review (UX-LT-4).
    if (home.reached === 'review') return screen === 'review';
    // M38: the pin follows the address, so it needs one.
    if (screen === 'pin') return missingCore(home.answers)[0] !== 'address';
    return screen === 'address' || screen === 'rent' || screen === 'home';
  }
  const { letting, rentCheck, setup } = home.detail;
  const closed = letting.status === 'let' || letting.status === 'withdrawn';
  if (letting.stage !== 'setup') {
    // After go-live, a few screens are still of use: the question that follows it, and, opened
    // on their own from Home on the letting's page (UX-LP-11), the letting details, the rent
    // check, the photos and the facts.
    if (screen === 'advertised') return letting.status === 'live';
    if (!alone || closed) return false;
    return (
      screen === 'pin' ||
      screen === 'details' ||
      screen === 'rent_check' ||
      screen === 'rent_result' ||
      screen === 'photos' ||
      screen === 'home'
    );
  }
  if (screen === 'review' || screen === 'advertised') return false;
  if (screen === 'rent_result') return Boolean(rentCheck);
  // UX-LT-14: the rent check comes before go-live. UX-AG-4: a held home has been decided.
  if (screen === 'go_live') return setup.rentCheckDone && !letting.goLiveHeldAt;
  return true;
}

/** Which part of the review each value that was read belongs to. */
const partOf: Record<SourcedField, ReviewPart> = {
  addressLine1: 'address',
  addressLine2: 'address',
  area: 'address',
  county: 'address',
  eircode: 'address',
  daftUrl: 'address',
  myhomeUrl: 'address',
  rentCents: 'rent',
  availableFrom: 'rent',
  propertyType: 'home',
  bedrooms: 'home',
  bathrooms: 'home',
  furnished: 'home',
  berRating: 'home',
  parking: 'home',
  ensuites: 'home',
  floorAreaSqm: 'home',
  floor: 'home',
  lift: 'home',
  heating: 'home',
  outdoorSpace: 'home',
  appliances: 'home',
  broadband: 'home',
  berNumber: 'home',
};

/**
 * UX-LT-3, UX-LT-6, UX-AI-4: what the review shows of a reading, in words. Each value's source
 * goes in the sheet its row opens; the lines left out, each with why, behind "Why?".
 */
function readingView(reading: DraftReading, hasCriteria: boolean): ReadingView {
  const r = copy.review;
  const sources: Partial<
    Record<ReviewPart, Array<{ label: string; quote: string; note: string | null }>>
  > = {};
  for (const field of sourcedFields) {
    const source = reading.sources[field];
    if (!source) continue;
    const isLink = field === 'daftUrl' || field === 'myhomeUrl';
    (sources[partOf[field]] ??= []).push({
      label: r.read.labels[field],
      quote: isLink ? source.quote : r.read.quote(source.quote),
      note: isLink ? r.read.linkKept : source.sure ? null : r.read.unsure,
    });
  }
  const s = r.suggested;
  const suggested = hasCriteria
    ? []
    : [
        reading.suggested.noPets
          ? { label: s.noPets, quote: reading.suggested.noPets.quote }
          : null,
        reading.suggested.minStayMonths
          ? { label: s.minStayMonths, quote: reading.suggested.minStayMonths.quote }
          : null,
        reading.suggested.maxOccupants
          ? { label: s.maxOccupants, quote: reading.suggested.maxOccupants.quote }
          : null,
      ].filter((each) => each !== null);
  for (const each of suggested) {
    (sources.details ??= []).push({
      label: each.label,
      quote: r.read.quote(each.quote),
      note: null,
    });
  }
  return {
    from: reading.from,
    sources,
    ownWords: reading.ownWords.map((each) => r.read.ownWords[each]),
    suggested: suggested.length > 0,
    leftOut: reading.leftOut.map((each) => ({
      line: each.line,
      why: leftOutWhy(each.line, each.reason),
    })),
  };
}

function reviewRows(
  home: FlowHome,
  today: string,
  href: (part: ReviewPart) => string,
): ReviewRow[] {
  const { answers } = home;
  const r = copy.review;
  const address = [answers.addressLine1, answers.addressLine2, answers.area, answers.eircode]
    .filter(Boolean)
    .join(', ');
  const date = !answers.availableFrom
    ? r.missing.availableFrom
    : answers.availableFrom < today
      ? r.datePassed(formatDate(answers.availableFrom))
      : r.availableFrom(formatDate(answers.availableFrom));
  const facts = [
    ...previewFacts(answers).map((fact) => `${fact.label}: ${fact.value}`),
    previewBer(answers.berRating) ?? r.missing.ber,
  ];
  const more = answers.otherFacts?.length ?? 0;
  const value: Record<ReviewPart, string> = {
    photos: home.photos.length > 0 ? copy.goLive.morePhotos(home.photos.length) : r.missing.photos,
    address: address || r.missing.address,
    rent: [
      answers.rentCents === undefined ? r.missing.rent : formatRent(answers.rentCents),
      date,
    ].join(' · '),
    home:
      answers.propertyType && answers.bedrooms !== undefined
        ? facts.join(' · ')
        : [r.missing.home, ...facts.slice(-1)].join(' · '),
    description: [
      answers.description ? r.hasDescription : r.missing.description,
      more > 0 ? r.moreFacts(more) : null,
    ]
      .filter(Boolean)
      .join(' · '),
    details:
      lettingDetailsLine(answers.criteria ?? null, answers.noSmokingIndoors ?? false) ??
      (home.reading && Object.keys(home.reading.suggested).length > 0
        ? r.suggested.meta
        : r.missing.details),
  };
  return (['photos', ...reviewGroups, 'details'] as const).map((part) => ({
    part,
    value: value[part],
    href: href(part),
  }));
}

/**
 * Every screen of adding a letting after the first, for a home that has an ID: a draft, or a
 * letting in set-up (UX-FL-1, UX-FL-2). One address per step, `/lettings/<id>/setup/<step>`,
 * so Back, a reload and "Continue" all land where they should.
 */
export default async function SetupStepPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string; step: string }>;
  searchParams: Promise<{
    from?: string | string[];
    alone?: string;
    edit?: string;
    then?: string;
    /** UX-TS-2: a code for what went wrong starting "Confirm it's you", said once. */
    identity_problem?: string;
  }>;
}) {
  const { lettingId: id, step: slug } = await params;
  const screen = screenFromSlug(slug);
  if (!screen) notFound();
  const { member, home } = await flowHome(id);
  const query = await searchParams;
  const from = fromOf(query.from);
  const lettingHref = `/lettings/${id}`;
  // On its own: the letting details or the rent check, opened from the letting's page.
  const alone = query.alone === '1' && home.kind === 'letting';
  if (!allowed(home, screen, alone)) {
    if (home.kind === 'letting' && home.detail.letting.stage !== 'setup') redirect(lettingHref);
    if (home.kind === 'letting' && screen === 'go_live') {
      // UX-AG-4: a held home has been decided, and its own page says so.
      if (home.detail.letting.goLiveHeldAt) redirect(lettingHref);
      // UX-LT-14: the rent check comes first. Its result says what's wrong, if anything is.
      redirect(screenHref(id, home.detail.rentCheck ? 'rent_result' : 'rent_check', from));
    }
    redirect(resumeHref(id, from));
  }

  const { today, inAYear } = availableWindow();
  const values = formValuesFrom(home.answers);
  const searchOn = addressSearch().name !== 'off';
  // M43: where the photo store can take photos straight from the browser, they go there.
  const direct = photosGoStraightToStore()
    ? {
        start: startPhotoUploadAction.bind(null, id),
        finish: finishPhotoUploadAction.bind(null, id),
      }
    : undefined;
  const leaveHref = alone ? (from ?? lettingHref) : (from ?? '/lettings');
  const at = (step: FlowStep) => flowSteps.indexOf(step);
  const frameFor = (step: FlowStep, exit = true): StepFrame => {
    if (alone) return { leaveHref };
    const before = at(step) > 0 ? flowSteps[at(step) - 1]! : null;
    return {
      leaveHref,
      step,
      exit,
      backHref: before
        ? screenHref(id, before, from)
        : home.kind === 'draft' && home.origin === 'manual'
          ? startHref(from)
          : undefined,
    };
  };

  switch (screen) {
    case 'review': {
      const open = (['photos', ...reviewGroups, 'details'] as const).find(
        (part) => part === query.edit,
      );
      const reviewHref = screenHref(id, 'review', from);
      const { reading } = home;
      const hasCriteria = Boolean(home.answers.criteria);
      // Section 6: what the advert says about letting details is switched on in the sheet,
      // for the person to save or switch off. Nothing is asked of renters until they do.
      const suggested = reading && !hasCriteria ? reading.suggested : {};
      return (
        <ReviewStep
          frame={{ leaveHref }}
          origin={home.kind === 'draft' ? home.origin : 'manual'}
          rows={reviewRows(home, today, (part) => screenHref(id, 'review', from, { edit: part }))}
          checks={reviewChecks(
            { answers: home.answers, photos: home.photos.length },
            today,
            reading,
          )}
          reading={reading ? readingView(reading, hasCriteria) : null}
          open={open ?? null}
          reviewHref={reviewHref}
          looksRight={confirmReviewAction.bind(null, id, from)}
          save={{
            address: saveReviewAction.bind(null, 'address', id),
            rent: saveReviewAction.bind(null, 'rent', id),
            home: saveReviewAction.bind(null, 'home', id),
            description: saveReviewAction.bind(null, 'description', id),
            details: saveReviewAction.bind(null, 'details', id),
          }}
          values={values}
          details={lettingDetailsFormValues({
            ...(home.answers.criteria ?? {
              noPets: suggested.noPets ? true : undefined,
              minStayMonths: suggested.minStayMonths?.value,
              maxOccupants: suggested.maxOccupants?.value,
            }),
            noSmokingIndoors: home.answers.noSmokingIndoors,
          })}
          availableFrom={home.answers.availableFrom ?? ''}
          today={today}
          inAYear={inAYear}
          searchOn={searchOn}
          photos={[...home.photos, ...home.floorPlans]}
          upload={uploadPhotoAction.bind(null, id)}
          direct={direct}
          remove={removePhotoAction.bind(null, id)}
          reorder={reorderPhotosAction.bind(null, id)}
          setKind={setPhotoKindAction.bind(null, id)}
        />
      );
    }
    case 'address':
      return (
        <AddressStep
          frame={frameFor('address')}
          action={saveStepAction.bind(null, 'address', id, from)}
          values={values}
          searchOn={searchOn}
        />
      );
    case 'pin': {
      // M135: with the map switched off there is no pin to place; the flow carries on.
      const settings = mapSettings();
      const pin = settings
        ? await pinFor(member, id, { streets: settings.provider === 'static' })
        : null;
      if (!settings || !pin) {
        redirect(
          alone ? lettingHref : screenHref(id, home.kind === 'draft' ? 'rent' : 'photos', from),
        );
      }
      return (
        <PinStep
          frame={
            alone
              ? { leaveHref }
              : { ...frameFor('address'), backHref: screenHref(id, 'address', from) }
          }
          action={savePinAction.bind(null, id, from, alone)}
          settings={settings}
          pin={pin}
          describe={describePinAction.bind(null, id)}
          primary={alone ? pinWords.save : copy.next}
        />
      );
    }
    case 'rent':
      return (
        <RentStep
          frame={frameFor('rent')}
          action={saveStepAction.bind(null, 'rent', id, from)}
          values={values}
          today={today}
          inAYear={inAYear}
        />
      );
    case 'home':
      // UX-LP-11: "Change" on the facts or the description, from Home.
      if (alone) {
        return query.edit === 'description' ? (
          <DescriptionStep
            frame={{ leaveHref }}
            action={saveHomePartAction.bind(null, 'description', id)}
            values={values}
          />
        ) : (
          <FactsStep
            frame={{ leaveHref }}
            action={saveHomePartAction.bind(null, 'home', id)}
            values={values}
          />
        );
      }
      return (
        <HomeStep
          frame={frameFor('home')}
          action={saveStepAction.bind(null, 'home', id, from)}
          values={values}
        />
      );
    default:
  }

  // From here on the home is a letting: `allowed` sends a draft back to what it still lacks.
  if (home.kind !== 'letting') redirect(resumeHref(id, from));
  const { detail } = home;
  const { letting } = detail;
  const answers: DraftAnswers = home.answers;

  switch (screen) {
    case 'photos': {
      const then = query.then === 'go-live' ? 'go_live' : 'details';
      return (
        <PhotosStep
          frame={frameFor('photos')}
          photos={[...home.photos, ...home.floorPlans]}
          upload={uploadPhotoAction.bind(null, id)}
          direct={direct}
          remove={removePhotoAction.bind(null, id)}
          reorder={reorderPhotosAction.bind(null, id)}
          setKind={setPhotoKindAction.bind(null, id)}
          done={
            alone ? photosChangedAction.bind(null, id) : photosDoneAction.bind(null, id, from, then)
          }
          doneLabel={alone ? copy.advertised.done : undefined}
        />
      );
    }
    case 'details': {
      const start = lettingDetailsFormValues({
        ...(letting.criteria ?? {}),
        noSmokingIndoors: letting.noSmokingIndoors,
      });
      return (
        <DetailsStep
          frame={frameFor('details')}
          action={saveDetailsAction.bind(null, id, from, alone)}
          values={start}
          availableFrom={letting.availableFrom}
          today={today}
          alone={alone}
          startsWithLine={lettingDetailsLine(letting.criteria, letting.noSmokingIndoors) !== null}
        />
      );
    }
    case 'rent_check': {
      // A check made before; or, for a home let again, what Gaff knows from last time.
      const fromBefore: RentAnswers | null = detail.rentCheck
        ? null
        : await rentAnswersFromLettingBefore(member, letting.previousLettingId);
      return (
        <RentCheckStep
          frame={frameFor('rent_check', false)}
          action={saveRentCheckAction.bind(null, id, from, alone)}
          start={detail.rentCheck ? rentAnswersFromCheck(detail.rentCheck) : (fromBefore ?? {})}
          fromLastTime={fromBefore !== null}
          today={today}
        />
      );
    }
    case 'rent_result': {
      const check = detail.rentCheck!;
      const words: { title: string } & Record<string, string> =
        copy.rentResult[check.result as RentCheckOutcome['result']];
      const over = detail.rentProblem
        ? { askingCents: letting.monthlyRentCents, ceilingCents: detail.rentProblem.ceilingCents }
        : null;
      return (
        <RentResultStep
          frame={
            alone
              ? { leaveHref }
              : {
                  leaveHref,
                  step: 'rent_check',
                  exit: true,
                  backHref: screenHref(id, 'rent_check', from),
                }
          }
          action={rentResultAction.bind(null, id, from, alone)}
          title={words.title}
          why={words[check.reason] ?? ''}
          over={over}
          rent={
            over
              ? (over.ceilingCents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 })
              : ''
          }
          rulesVersion={check.rulesVersion ?? RENT_RULES_VERSION}
          alone={alone}
        />
      );
    }
    case 'go_live': {
      // P54: back from Stripe's pages, their own check is read from Stripe if it's due.
      await settlePersonIdentity(member.userId);
      const step = await goLiveStepFor(member, detail);
      const preview = (
        <HomePreview home={answers} photos={home.photos} letBy={step.organisationName} />
      );
      // UX-TS-2 (Q47): a private landlord confirms it's them, once, as this step.
      if (!step.gate.open && step.gate.reason === 'identity_needed') {
        return (
          <GoLiveIdentity
            frame={frameFor('go_live', false)}
            action={confirmItsYouAction.bind(null, id, from)}
            last={await personCheckOf(member.userId)}
            problem={query.identity_problem}
          />
        );
      }
      if (!step.gate.open && !step.gate.waits) {
        return (
          <GoLiveHeld
            frame={frameFor('go_live', false)}
            preview={preview}
            why={goLiveCopy.held[step.gate.reason](step.organisationName)}
            fix={
              step.gate.reason === 'no_licence'
                ? { href: addAgencyHref, label: goLiveCopy.findLicence }
                : null
            }
            lettingHref={lettingHref}
          />
        );
      }
      return (
        <GoLiveStep
          frame={frameFor('go_live')}
          action={goLiveAction.bind(null, id, from)}
          preview={preview}
          onGaff={letting.onGaff}
          needsBer={step.onGaffNeeds.includes('ber')}
          needsPhoto={step.onGaffNeeds.includes('photo')}
          photosHref={screenHref(id, 'photos', from, { then: 'go-live' })}
          askPhone={step.asks.phone === 'offered'}
        />
      );
    }
    case 'advertised':
      return (
        <AdvertisedStep
          frame={{ leaveHref: lettingHref }}
          action={advertisedAction.bind(null, id)}
          address={letting.addressLine1}
          chosen={
            letting.advertisedOn === null
              ? []
              : letting.advertisedOn.length > 0
                ? letting.advertisedOn
                : ['no']
          }
        />
      );
    default:
      notFound();
  }
}
