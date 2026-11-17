/**
 * The words of a home's public page on Gaff (UX-LS-1 to UX-LS-11, UX-TS-3), and of the screens
 * opened from it. Plain, warm Irish English. One reassurance line, under the action (UX-LS-4);
 * no counters, no countdowns, nothing to hurry anyone (UX-LS-9); nothing called "who it suits"
 * (rule 3). The letting details are Gaff's own fixed words, from `src/domain/criteria`.
 */
export const homePageCopy = {
  askToView: 'Ask to view',
  call: 'Call',
  callName: (number: string) => `Call ${number}`,
  /** UX-LS-4: the only line of its kind on the page. */
  reassurance: 'Free. You’ll hear back either way.',
  highlights: 'Highlights',
  showAllHighlights: (count: number) => `Show all ${count}`,
  lettingDetails: 'Letting details',
  about: 'About this home',
  showMore: 'Show more',
  showLess: 'Show less',
  ber: 'Energy rating',
  letBy: 'Let by',
  licence: (number: string) => `PSRA licence ${number}`,
  /** Q47, UX-TS-1: beside a private landlord's first name. */
  identityVerified: 'Identity verified',
  /** "Ring Mary on 087 765 4321", under the lister, where they gave a number. */
  ring: (name: string, number: string) => `Ring ${name} on ${number}`,
  report: 'Report this listing',
  let: {
    title: 'This home has been let',
    text: 'It’s no longer taking enquiries. Homes are added to Gaff every week.',
    otherHomes: (place: string) => `See other homes in ${place}`,
  },
  notAvailable: {
    title: 'This home isn’t on Gaff',
    text: 'It may have been let, or taken off Gaff by whoever was letting it. Homes are added every week.',
    action: 'See homes on Gaff',
  },
} as const;

/** UX-TS-3: "Report this listing", one question with tap answers. No account needed. */
export const reportCopy = {
  pageTitle: 'Report this listing',
  title: 'What’s wrong with this listing?',
  reasons: {
    scam: 'It looks like a scam',
    wrong_details: 'The details are wrong',
    unfair: 'It’s unfair about who can apply',
    something_else: 'Something else',
  },
  note: 'What’s wrong?',
  noteHint: 'A few words is enough.',
  send: 'Send report',
  sending: 'Sending…',
  back: 'Back to the home',
  sent: {
    title: 'Thanks for telling us',
    text: 'Gaff’s team reads every report and acts on it within one working day. You don’t need to do anything else.',
    action: 'Back to the home',
  },
  gone: 'This home isn’t on Gaff any more, so there’s nothing to report.',
} as const;
