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
  /** A line under each stage's name, by the stage's name. */
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
    stages: {},
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
    stages: {},
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
  retitle: Record<string, Partial<Pick<Entry, 'title' | 'caption'>>>;
  /** The line at the foot of the cover. */
  made: string;
  leftOut: string[];
  states: string[];
} = {
  drop: [],
  parts: {},
  retitle: {},
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
