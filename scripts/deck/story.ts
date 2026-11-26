import type { Entry, Journey } from '../../tests/deck/capture';

/**
 * The words of the deck that aren't on a screen's own slide: its three chapters, a line for
 * each stage, and the editor's cuts. A screen's own title and caption are written where it is
 * photographed (tests/deck).
 */
export type Chapter = {
  journey: Journey;
  /** The runs its screens come from, in order (screenshots/deck/<run>). */
  runs: string[];
  title: string;
  who: string;
  summary: string;
  cast: [name: string, role: string][];
  /** A line under each stage's name, by the stage's name. Their order here is the deck's. */
  stages: Record<string, string>;
};

export const chapters: Chapter[] = [
  {
    journey: 'landlord',
    runs: ['own-home'],
    title: 'Letting your own home',
    who: 'A private landlord lets her flat',
    summary:
      'Mary Byrne owns one flat in Ranelagh. She signs up, lists it, and lets it to a renter who found it on Gaff, from her first visit to the results screen.',
    cast: [
      ['Mary Byrne', 'The landlord. Lets her own flat, with no agent.'],
      ['Niamh Kelly', 'The renter she lets it to.'],
      ['Conor Walsh', 'Another renter who asks to view.'],
    ],
    stages: {
      'Signing up': 'From the public site to an account: an emailed code, and no password.',
      'Adding the home':
        'The address, the rent, the home’s facts and its photos, one question to a screen.',
      'Going live':
        'Mary confirms it’s her, once. The home goes public, and she sets when people can view.',
      'Enquiries arrive':
        'Gaff answers what it can from the home’s facts, and brings Mary the rest.',
      'Choosing who views': 'Gaff shows who meets what was asked. Mary decides who is invited.',
      'Viewing day': 'The calendar, the day’s viewings, and marking who came.',
      'Choosing an applicant':
        'Mary chooses from the people who applied. Only then do checks begin.',
      Checks: 'The chosen renter’s ID, references and income, shared with her yes.',
      'The offer': 'Three comparable rents, the terms, and the offer sent.',
      'The tenancy':
        'The agreement signed by both sides, the money paid to Mary’s own account, the RTB, the keys.',
      Finishing: 'The letting is closed, everyone is told, and Mary sees how it went.',
      'Around Gaff': 'Today, Inbox, the account menu, Settings, Profile and Help.',
    },
  },
  {
    journey: 'renter',
    runs: ['own-home', 'agency'],
    title: 'Renting a home',
    who: 'A renter finds a home and moves in',
    summary:
      'Niamh Kelly is looking for a home in Dublin 6. She searches Gaff, asks to view Mary’s flat, and goes from a viewing to her keys. Then the other ways a renter can arrive.',
    cast: [
      ['Niamh Kelly', 'The renter. Makes a Gaff account and rents Mary’s flat.'],
      ['Conor Walsh', 'Asks to view without an account.'],
      ['Aoife Byrne and Ciarán Ó Súilleabháin', 'Arrive by email, from Daft and MyHome.'],
    ],
    stages: {
      'Finding a home':
        'Search by a place, a road or a sentence, on a list and a map. No account is needed.',
      'Making an account': 'An emailed code, her name, and what brings her to Gaff.',
      'Saving homes and searches':
        'A heart keeps a home. A saved search sends an alert when a new home is listed.',
      'Asking to view': 'Three short questions, then a page of her own for this home.',
      'Booking a viewing': 'An invitation by email, a time chosen, and a mobile confirmed by text.',
      Applying: 'After the viewing: how she earns and her income, and nothing more.',
      Checks: 'Only once she is chosen: her ID, references, and work and income documents.',
      'The offer': 'The terms, one total to pay, and her answer.',
      'Signing and paying':
        'The agreement signed on her phone, then the deposit and rent paid straight to the landlord.',
      'Moving in': 'The inventory checked, and the keys.',
      'Your account': 'Her enquiries, her saved homes, her profile and her data.',
      'Without an account': 'Another way in: asking to view with only a name and an email.',
      'Arriving from Daft or MyHome':
        'Another way in: an enquiry on a portal, answered by Gaff’s first email.',
      'If you’re the backup': 'What the second choice sees while the first is being checked.',
      'If the home goes to someone else': 'Everyone who enquired is told, the same day.',
    },
  },
  {
    journey: 'agent',
    runs: ['agency'],
    title: 'Letting for a client',
    who: 'A letting agent lets a flat for its owner',
    summary:
      'Ann Power works at Halcyon Lettings. She signs the agency up, adds a flat from its advert, and lets it for its owner to a renter who enquired on Daft.',
    cast: [
      ['Ann Power', 'The agent, at Halcyon Lettings.'],
      ['Brian Daly', 'Her teammate, invited to the agency.'],
      ['Tom Walsh', 'The owner. Approves the tenant, with no account.'],
      ['Aoife Byrne', 'The renter. Ciarán Ó Súilleabháin is the backup.'],
    ],
    stages: {},
  },
];

/** The editor's cuts and corrections, by `<run>/<id>` as the manifest names a screen. */
export const edits: {
  /** Screens left out of the deck. */
  drop: string[];
  /** The most windows of a long screen to show (3 unless set). */
  parts: Record<string, number>;
  /** A screen's words, put right. */
  change: Record<string, Partial<Pick<Entry, 'title' | 'caption' | 'path' | 'meanwhile'>>>;
  /** The line at the foot of the cover. */
  made: string;
  leftOut: string[];
  states: string[];
} = {
  drop: [],
  parts: {},
  change: {
    'own-home/038-renter-how-results-are-ordered': { path: '/how-results-are-ordered' },
  },
  made: 'Photographed from the product, November 2026. Made-up people and homes.',
  leftOut: [
    'Developments: an agency adding many alike homes in one step.',
    'Gaff’s own team’s pages: confirming agencies is shown once; reported listings, appeals and funnels are not.',
    'Signing in with Google, Apple or a passkey: the buttons are shown, the other companies’ screens are not.',
    'The dark theme.',
  ],
  states: [
    'Errors at a field, and expired or ended links.',
    'A viewing cancelled or moved, a place from the waiting list, and a renter who doesn’t come.',
    'A check that doesn’t pass, an owner who says no, and an offer that is declined.',
    'A listing reported or held, and a home that steps back after “Still available?” goes unanswered.',
  ],
};
