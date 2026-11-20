import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { developmentCopy } from '@/copy/developments';
import { lettingDetailsFormValues } from '@/domain/criteria/criteria';
import { developmentPageHref, isTypeStep, typeStepHref } from '@/domain/developments/links';
import { availableWindow } from '@/domain/lettings/new-letting';
import { formatRent } from '@/lib/format';
import { developmentView, sharedPhotos } from '@/server/developments/developments';
import { goLiveGateFor } from '@/server/lettings/go-live';
import { photosGoStraightToStore } from '@/server/lettings/photos';
import {
  finishPhotoUploadAction,
  removePhotoAction,
  reorderPhotosAction,
  setPhotoKindAction,
  startPhotoUploadAction,
  uploadPhotoAction,
} from '../../../../../_flow/actions';
import { RentCheckStep } from '../../../../../_flow/RentCheck';
import { DetailsStep, PhotosStep } from '../../../../../_flow/Steps';
import {
  makeHomesAction,
  putTypeLiveAction,
  saveTypeAction,
  saveTypeDetailsAction,
  saveTypeRentAction,
  saveTypeRentCheckAction,
  typePhotosDoneAction,
} from '../../../../_flow/actions';
import { devFrame, requireDevelopmentMember } from '../../../../_flow/frame';
import { HomesStep, ReviewStep, TypeRentStep, TypeStep } from '../../../../_flow/Steps';

export const metadata: Metadata = { title: developmentCopy.flow };

const copy = developmentCopy;

/**
 * BA-15 (M33, M35): a type's screens, one question each: the type, its rent and how many, its
 * photos, which homes they are, then the letting details and the rent check once for all of
 * them, and "Check the homes", which puts them live together.
 */
export default async function TypeStepPage({
  params,
}: {
  params: Promise<{ developmentId: string; typeId: string; step: string }>;
}) {
  const { developmentId: id, typeId, step } = await params;
  if (!isTypeStep(step)) notFound();
  const member = await requireDevelopmentMember();
  const view = await developmentView(member, id);
  const type = view?.types.find((each) => each.id === typeId);
  if (!view || !type) notFound();
  const href = (to: Parameters<typeof typeStepHref>[2]) => typeStepHref(id, typeId, to);
  const { today, inAYear } = availableWindow();
  const settingUp = type.homes.filter((home) => home.status === 'draft');
  // The letting details, the rent check and the review are for homes that exist.
  const needsHomes = step === 'details' || step === 'rent-check' || step === 'review';
  if (needsHomes && type.homes.length === 0) redirect(href('homes'));
  if (needsHomes && settingUp.length === 0) redirect(developmentPageHref(id));

  switch (step) {
    case 'home':
      return (
        <TypeStep
          frame={devFrame(id, 'home', developmentPageHref(id))}
          action={saveTypeAction.bind(null, id, typeId)}
          values={{
            name: type.name,
            propertyType: type.propertyType,
            bedrooms: String(type.bedrooms),
            bathrooms: type.bathrooms === null ? '' : String(type.bathrooms),
            furnished: type.furnished ?? '',
            berRating: type.berRating ?? '',
            floorAreaSqm: type.floorAreaSqm === null ? '' : String(type.floorAreaSqm),
          }}
        />
      );
    case 'rent':
      return (
        <TypeRentStep
          frame={devFrame(id, 'rent', href('home'))}
          action={saveTypeRentAction.bind(null, id, typeId)}
          values={{
            rent:
              type.rentCents === null
                ? ''
                : (type.rentCents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 }),
            count: type.homeCount === null ? '' : String(type.homeCount),
          }}
        />
      );
    case 'photos': {
      if (type.rentCents === null) redirect(href('rent'));
      return (
        <PhotosStep
          frame={devFrame(id, 'photos', href('rent'))}
          title={copy.typePhotos.title}
          lead={copy.typePhotos.lead}
          photos={await sharedPhotos(member, { unitTypeId: typeId })}
          upload={uploadPhotoAction.bind(null, typeId)}
          direct={
            photosGoStraightToStore()
              ? {
                  start: startPhotoUploadAction.bind(null, typeId),
                  finish: finishPhotoUploadAction.bind(null, typeId),
                }
              : undefined
          }
          remove={removePhotoAction.bind(null, typeId)}
          reorder={reorderPhotosAction.bind(null, typeId)}
          setKind={setPhotoKindAction.bind(null, typeId)}
          done={typePhotosDoneAction.bind(null, id, typeId)}
        />
      );
    }
    case 'homes': {
      if (type.rentCents === null || type.homeCount === null) redirect(href('rent'));
      const count = type.homeCount - type.homes.length;
      if (count <= 0) redirect(settingUp.length > 0 ? href('details') : developmentPageHref(id));
      return (
        <HomesStep
          frame={devFrame(id, 'homes', href('photos'))}
          action={makeHomesAction.bind(null, id, typeId, count)}
          count={count}
          made={type.homes.length}
          today={today}
          inAYear={inAYear}
          start={{ availableFrom: '' }}
        />
      );
    }
    case 'details':
      return (
        <DetailsStep
          frame={devFrame(id, 'details', href('homes'))}
          action={saveTypeDetailsAction.bind(null, id, typeId)}
          values={lettingDetailsFormValues({})}
          availableFrom={settingUp.map((home) => home.availableFrom).sort()[0]!}
          today={today}
          alone={false}
          startsWithLine={false}
        />
      );
    case 'rent-check':
      return (
        <RentCheckStep
          frame={devFrame(id, 'rent-check', href('details'), false)}
          action={saveTypeRentCheckAction.bind(null, id, typeId)}
          start={{}}
          fromLastTime={false}
          today={today}
        />
      );
    case 'review': {
      const { gate, organisationName } = await goLiveGateFor(member);
      const now = new Date();
      const live = type.homes.filter((home) => home.status === 'live').length;
      return (
        <ReviewStep
          frame={devFrame(id, 'review', href('rent-check'), false)}
          action={putTypeLiveAction.bind(null, id, typeId)}
          lead={
            gate.open
              ? copy.review.lead(settingUp.length, live)
              : copy.review.heldLead(organisationName)
          }
          homes={settingUp.map((home) => ({
            id: home.id,
            addressLine1: home.addressLine1,
            line: [
              formatRent(home.rentCents),
              home.unitFloor === null ? null : copy.review.floor(home.unitFloor),
              copy.review.free(home.availableFrom, now),
            ]
              .filter(Boolean)
              .join(' · '),
            needsLook: home.rentCheck === 'get_advice',
          }))}
        />
      );
    }
  }
}
