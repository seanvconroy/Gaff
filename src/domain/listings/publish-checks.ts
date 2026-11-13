import { blockingFindings, checkListingText } from '@/domain/moderation/listing-text';
import { berFromLettingRating, berProblem } from '@/domain/homes/ber';
import { depositProblem } from '@/domain/homes/facts';
import { isOnMap, type PointSource } from '@/domain/map/pin';
import { MIN_PHOTOS_TO_PUBLISH } from '@/domain/media/photos';
import { missingCheckWords, type MissingCheck } from '@/domain/verification/readiness';

/**
 * M48: everything a listing needs before it can go live. Each problem names the section of the
 * editor to fix it in, in the letter's words. Risk signals (M29) are separate: they hold a
 * listing for a person rather than refuse it.
 */

export type Section =
  | 'checks'
  | 'setup'
  | 'home'
  | 'location'
  | 'price'
  | 'photos'
  | 'description'
  | 'criteria'
  | 'publish';

export interface PublishProblem {
  section: Section;
  message: string;
}

export interface PublishDraft {
  lettingStatus: 'draft' | 'live' | 'let' | 'withdrawn';
  rentCents: number;
  depositCents: number | null;
  criteriaSet: boolean;
  home: {
    berRating: string;
    berScale: 'previous' | 'new' | null;
    berNumber: string | null;
    berCertificateDate: string | null;
    heating: string | null;
    outdoorSpace: string | null;
    latitude: number | null;
    longitude: number | null;
    pointSource: PointSource;
  };
  /**
   * M38: whether a pin can be placed here: false while the map is switched off, when a home
   * goes live at its area's centre, in the list alone, as before the map.
   */
  pinNeeded: boolean;
  photosReady: number;
  description: string | null;
  missingChecks: readonly MissingCheck[];
  declared: boolean;
}

export function publishProblems(draft: PublishDraft): PublishProblem[] {
  const problems: PublishProblem[] = [];
  const add = (section: Section, message: string) => problems.push({ section, message });

  if (draft.lettingStatus === 'let' || draft.lettingStatus === 'withdrawn') {
    add('publish', 'This letting is closed. Let the home again to list it.');
    return problems;
  }
  for (const missing of draft.missingChecks) add('checks', missingCheckWords[missing]);
  // Enquiries from the listing start the workflow, so its set-up must be confirmed (stage 1).
  if (draft.lettingStatus === 'draft') {
    add('setup', 'Confirm the letting’s set-up first: viewing times, criteria and the rent check');
  }

  if (!draft.home.heating) add('home', 'Choose the heating');
  if (!draft.home.outdoorSpace) add('home', 'Choose the outdoor space, or “No outdoor space”');
  if (draft.pinNeeded && !isOnMap(draft.home.pointSource)) {
    add('location', 'Place the pin on the map, so renters see where the home is');
  } else if (draft.home.latitude === null || draft.home.longitude === null) {
    add('home', 'Confirm where the home is');
  }
  const ber =
    draft.home.berRating === 'exempt'
      ? berFromLettingRating('exempt')
      : {
          kind: 'rated' as const,
          scale: draft.home.berScale ?? 'previous',
          rating: draft.home.berRating,
          ...(draft.home.berNumber ? { number: draft.home.berNumber } : {}),
          ...(draft.home.berCertificateDate
            ? { certificateDate: draft.home.berCertificateDate }
            : {}),
        };
  const berWrong = berProblem(ber);
  if (berWrong) add('home', berWrong);

  if (draft.depositCents === null) add('price', 'Enter the deposit, or 0 for none');
  else {
    const depositWrong = depositProblem(draft.depositCents, draft.rentCents);
    if (depositWrong) add('price', depositWrong);
  }

  if (draft.photosReady < MIN_PHOTOS_TO_PUBLISH) {
    add('photos', `Add at least ${MIN_PHOTOS_TO_PUBLISH} photos of the home`);
  }

  const description = draft.description?.trim() ?? '';
  if (description.length < 80) {
    add('description', 'Describe the home in a few sentences: at least 80 characters');
  }
  for (const finding of blockingFindings(checkListingText(description))) {
    add('description', finding.message);
  }

  if (!draft.criteriaSet) add('criteria', 'Set what you’re looking for, from the lawful list');
  if (!draft.declared) {
    add('publish', 'Confirm you own the home or can let it, and that you’ll register the tenancy');
  }
  return problems;
}

/** M25: the declaration a letter makes before a home first goes live. Versioned, like templates. */
export const DECLARATION = {
  version: 'm25-v1',
  words:
    'I own this home or I’m authorised to let it, and the tenancy will be registered with the Residential Tenancies Board.',
} as const;
