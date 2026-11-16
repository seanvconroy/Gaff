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
  } satisfies Record<GoLiveHold, (agencyName: string) => string>,
  findLicence: 'Find our licence',
} as const;
