import type { FirstRunStep, Purpose } from '@/domain/accounts/first-run';

/**
 * Every word of first run (section 2 of the UX redesign, "First run" and "Confirming an
 * agency"). It is not a chat, but each screen is a question from the assistant, one at a time,
 * in plain words. No tagline and no description of Gaff. Renters see these screens too.
 */
export const firstRunCopy = {
  /** What the progress is through, for screen readers. */
  progress: 'Getting started',
  /** The name of each part, under its segment of the progress bar. */
  segments: {
    name: 'You',
    purpose: 'What you need',
    agency: 'Your agency',
    confirm: 'Check',
  } satisfies Record<FirstRunStep, string>,
  continue: 'Continue',
  saving: 'Saving…',
  back: 'Back',
  /** The way out, top left: nothing is lost, and first run opens where it was left (UX-AC-10). */
  leave: 'Leave for now',

  name: {
    title: 'Let’s get you started. What’s your name?',
    label: 'First and last name',
  },

  purpose: {
    /** The first screen someone sees, when sign-in supplied their name. */
    titleFirst: 'Let’s get you started. What brings you to Gaff?',
    /** After they've given their name. */
    titleAfterName: (firstName: string) => `Thanks, ${firstName}. What brings you to Gaff?`,
    title: 'What brings you to Gaff?',
    legend: 'What brings you to Gaff?',
    options: {
      renting: 'I’m looking for a home',
      own_home: 'I’m letting a home I own',
      agency: 'I work at a letting agency',
    } satisfies Record<Purpose, string>,
    missing: 'Choose the one that fits best. You can add the others later.',
  },

  agency: {
    title: 'Which agency?',
    lead: 'Type its name and pick it from the list.',
    label: 'Agency name',
    search: 'Search',
    searching: 'Searching…',
    found: (count: number) => (count === 1 ? '1 agency found' : `${count} agencies found`),
    registeredAs: (name: string) => `Registered as ${name}`,
    licence: (number: string) => `PSRA licence ${number}`,
    onGaff: 'On Gaff',
    none: (typed: string) => `We can’t find “${typed}” among the agencies licensed to let.`,
    /** UX-AG-2: the two ways on when the name isn't found. */
    byLicence: 'Enter the licence number instead',
    applying: 'We’re applying for a licence',
    /** Q39: the PSRA's re-use terms ask that the register be credited. */
    credit: 'Agency details are from the PSRA’s register of licensed property services providers.',
  },

  licence: {
    title: 'What’s your agency’s PSRA licence number?',
    label: 'Licence number',
    hint: 'Six digits, like 001234. It’s on your agency’s licence.',
  },

  applying: {
    title: 'What’s your agency called?',
    lead: 'You can set everything up now. Your homes can go live once your licence is on the PSRA’s register.',
    label: 'Agency name',
    hint: 'Renters see this name on every page and message.',
    submit: 'Set up my agency',
  },

  confirm: {
    title: 'Is this your agency?',
    rows: {
      registeredName: 'Registered name',
      tradingName: 'Trading name',
      licenceNumber: 'Licence number',
      licenceType: 'Licence type',
      county: 'County',
    },
    yes: 'Yes, that’s us',
    no: 'No, search again',
    /** UX-AG-3: a confirmed agency already holds this licence. One action. */
    onGaff: (agencyName: string) => `${agencyName} is already on Gaff.`,
    onGaffNext: 'Ask to join and its admins can add you to the team.',
    askToJoin: 'Ask to join',
    asking: 'Asking…',
  },

  asked: {
    title: (agencyName: string) => `We’ve asked ${agencyName}`,
    text: 'Your request is with the agency’s admins. When one of them says yes, you’ll find the agency here in Gaff.',
    lookAround: 'Look around Gaff',
    somethingElse: 'Choose something else',
  },
} as const;
