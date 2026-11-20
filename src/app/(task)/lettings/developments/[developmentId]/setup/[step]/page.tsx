import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { addressSearch } from '@/adapters/address';
import { addLettingCopy } from '@/copy/add-letting';
import { developmentCopy } from '@/copy/developments';
import { developmentStepHref, isDevelopmentStep } from '@/domain/developments/links';
import { mapSettings } from '@/lib/map';
import { developmentView, sharedPhotos } from '@/server/developments/developments';
import { pinFor } from '@/server/lettings/location';
import { photosGoStraightToStore } from '@/server/lettings/photos';
import {
  describePinAction,
  finishPhotoUploadAction,
  removePhotoAction,
  reorderPhotosAction,
  setPhotoKindAction,
  startPhotoUploadAction,
  uploadPhotoAction,
} from '../../../../_flow/actions';
import { PinStep } from '../../../../_flow/PinStep';
import { AddressStep, PhotosStep } from '../../../../_flow/Steps';
import {
  developmentPhotosDoneAction,
  saveDevelopmentAddressAction,
  saveDevelopmentFactsAction,
  saveDevelopmentPinAction,
} from '../../../_flow/actions';
import { devFrame, requireDevelopmentMember } from '../../../_flow/frame';
import { FactsStep } from '../../../_flow/Steps';

export const metadata: Metadata = { title: developmentCopy.flow };

/**
 * BA-15 (M32): a development's own screens, one question each: where it is, its pin, what its
 * homes share, and its photos. Each is the same screen, fields and checks as adding one home.
 */
export default async function DevelopmentSetupPage({
  params,
}: {
  params: Promise<{ developmentId: string; step: string }>;
}) {
  const { developmentId: id, step } = await params;
  if (!isDevelopmentStep(step)) notFound();
  const member = await requireDevelopmentMember();
  const view = await developmentView(member, id);
  if (!view) notFound();
  const { development } = view;
  // The pin, the facts and the photos follow the address.
  if (step !== 'address' && !view.shared) redirect(developmentStepHref(id, 'address'));

  switch (step) {
    case 'address':
      return (
        <AddressStep
          frame={devFrame(id, 'address')}
          action={saveDevelopmentAddressAction.bind(null, id)}
          values={{
            addressLine1: development.addressLine1 ?? '',
            area: development.area ?? '',
            county: development.county ?? '',
            eircode: development.eircode ?? '',
          }}
          searchOn={addressSearch().name !== 'off'}
        />
      );
    case 'pin': {
      // M135: with the map switched off there is no pin to place; the flow carries on.
      const settings = mapSettings();
      const pin = settings
        ? await pinFor(member, id, { streets: settings.provider === 'static' })
        : null;
      if (!settings || !pin) redirect(developmentStepHref(id, 'facts'));
      return (
        <PinStep
          frame={devFrame(id, 'pin', developmentStepHref(id, 'address'))}
          action={saveDevelopmentPinAction.bind(null, id)}
          settings={settings}
          pin={pin}
          describe={describePinAction.bind(null, id)}
          primary={addLettingCopy.next}
        />
      );
    }
    case 'facts':
      return (
        <FactsStep
          frame={devFrame(id, 'facts', developmentStepHref(id, 'pin'))}
          action={saveDevelopmentFactsAction.bind(null, id)}
          values={{
            parking: development.parking ?? '',
            description: development.description ?? '',
          }}
        />
      );
    case 'photos': {
      const photos = await sharedPhotos(member, { developmentId: id });
      return (
        <PhotosStep
          frame={devFrame(id, 'photos', developmentStepHref(id, 'facts'))}
          title={developmentCopy.photos.title}
          lead={developmentCopy.photos.lead}
          photos={photos}
          upload={uploadPhotoAction.bind(null, id)}
          direct={
            photosGoStraightToStore()
              ? {
                  start: startPhotoUploadAction.bind(null, id),
                  finish: finishPhotoUploadAction.bind(null, id),
                }
              : undefined
          }
          remove={removePhotoAction.bind(null, id)}
          reorder={reorderPhotosAction.bind(null, id)}
          setKind={setPhotoKindAction.bind(null, id)}
          done={developmentPhotosDoneAction.bind(null, id)}
        />
      );
    }
  }
}
