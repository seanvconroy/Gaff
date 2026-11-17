import type { GoLiveHold } from '@/domain/organisations/go-live-gate';

/**
 * The words of the go-live step when a home can't go live yet (section 2 of the UX redesign,
 * "Confirming an agency"). Going live is the only thing ever held. Each says what is happening,
 * and what happens next.
 */
export const goLiveCopy = {
  /** UX-AG-4: the person has decided to go live, and their agency is being confirmed. */
  waiting: (agencyName: string) =>
    `We’re confirming ${agencyName}. This usually takes under an hour. We’ll email you, and this home will go live then.`,
  /** Why a home can't go live, where nothing waits (UX-AG-2, UX-AG-6). */
  held: {
    no_licence: (agencyName: string) =>
      `This home can’t go live yet: ${agencyName} has no PSRA licence on Gaff. When your licence comes through, find it on the register and we’ll confirm it.`,
    licence_lapsed: (agencyName: string) =>
      `This home can’t go live yet: ${agencyName}’s PSRA licence isn’t on this week’s register. The homes you have live carry on. We check the register every week, and we’ll email you when it’s back.`,
    being_confirmed: (agencyName: string) =>
      `We’re confirming ${agencyName}. This usually takes under an hour.`,
    /** UX-TS-2 (Q47): a private landlord who hasn't confirmed it's them yet. */
    identity_needed: () =>
      'One check before your home goes live: confirm it’s you. It takes about two minutes, once.',
  } satisfies Record<GoLiveHold, (agencyName: string) => string>,
  findLicence: 'Find our licence',
  confirmItsYou: 'Confirm it’s you',
  /**
   * UX-LT-21: "On gaff.ie" on a live letting's page, until work package WP-15's Home view takes
   * it. Switching it off takes the home's page down at once; it still takes enquiries.
   */
  onGaff: {
    title: 'On gaff.ie',
    shown: 'Renters can find this home on Gaff and ask to view.',
    seePage: 'See its page',
    needs: (needs: { ber: boolean; photo: boolean }) =>
      `It will show on gaff.ie once it has ${[needs.ber ? 'a BER' : null, needs.photo ? 'a photo' : null].filter(Boolean).join(' and ')}.`,
    off: 'Not shown on gaff.ie. Gaff still answers its enquiries from Daft and MyHome.',
    held: 'Not shown on gaff.ie while the home can’t go live.',
    turnOff: 'Take it off gaff.ie',
    turnOn: 'Show it on gaff.ie',
    saving: 'Saving…',
  },
} as const;
