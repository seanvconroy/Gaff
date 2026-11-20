import { formatDate, formatRent } from '@/lib/format';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * BA-15: the words of a development, its types and its many alike homes, on the letting side
 * and the public side. Plain, warm Irish English; every screen says what happens next. A
 * development is facts about homes: nothing here is about who should live in them (rule 3).
 */
export const developmentCopy = {
  flow: 'Add a development',
  /** On "Tell Gaff about the home": the way to add many alike homes. */
  start: {
    several: 'Several alike in one development',
    severalLead: 'For a scheme of homes: add its types, and Gaff makes each home for you.',
  },
  name: {
    title: 'What is the development called?',
    lead: 'Its name as renters will see it. Each home adds its own number, like Apartment 12.',
    label: 'Name',
  },
  address: {
    title: 'Where is it?',
    lead: 'The street address the homes share.',
  },
  facts: {
    title: 'What do the homes share?',
    lead: 'Each home takes these, and you can change one home on its own later.',
    parking: 'Parking',
    description: 'About the development',
    descriptionHint:
      'The building, the grounds and what’s nearby, in a few sentences. Not who should live there.',
  },
  photos: {
    title: 'Photos of the development',
    lead: 'The building, the shared spaces, the views. Every home in it shows these.',
  },
  type: {
    title: 'What kind of home is this?',
    lead: 'A type is a kind of home in the development, like the 2-bed apartments. You can add more types after.',
    name: 'Name of the type',
    nameHint: 'Like Type B, or 2-bed apartments',
    floorArea: 'Floor area in square metres',
  },
  rent: {
    title: 'Rent, and how many',
    rent: 'Rent for each home, a month',
    count: 'How many homes of this type',
    countHint: 'You give each one its number on the next screen.',
  },
  typePhotos: {
    title: 'Photos of this type',
    lead: 'Inside the homes, and the floor plan. Every home of this type shows these.',
  },
  homes: {
    title: 'Which homes are they?',
    lead: 'Each home’s number or door, its floor, and the date it’s free.',
    unit: (n: number) => `Home ${n}: number or door`,
    unitHint: 'Like Apartment 12',
    floor: (n: number) => `Home ${n}: floor`,
    floorHint: '0 for the ground floor. You can leave it blank.',
    availableFrom: (n: number) => `Home ${n}: free from`,
    make: (n: number) => `Add ${plural(n, 'home', 'homes')}`,
    already: (n: number) =>
      `${plural(n, 'home of this type is', 'homes of this type are')} already added.`,
  },
  details: {
    lead: 'These apply to every home of this type. You can change one home on its own later.',
  },
  rentCheck: {
    lead: 'One rent check for every home of this type, each against its own rent.',
  },
  review: {
    title: 'Check the homes',
    lead: (n: number, live: number) =>
      live > 0
        ? `${plural(n, 'home is', 'homes are')} ready. ${plural(live, 'home is', 'homes are')} live already.`
        : `${plural(n, 'home is', 'homes are')} ready to go live.`,
    floor: (floor: number) => (floor === 0 ? 'Ground floor' : `Floor ${floor}`),
    free: (date: string, now: Date) => `Free from ${formatDate(date, now)}`,
    rent: (cents: number) => formatRent(cents),
    getAdvice: 'Its rent check needs a look: open the home to finish it.',
    putLive: (n: number) => `Put ${plural(n, 'home', 'homes')} live`,
    putting: 'Putting them live…',
    nothing: 'Every home of this type is live. Add another type, or open a home.',
    afterLive:
      'Gaff starts answering each home’s enquiries now. Each home has its own people, viewings and decisions.',
    heldLead: (name: string) =>
      `You’ve decided to put these homes live. They go live when ${name} is confirmed.`,
  },
  page: {
    counts: (homes: number) => plural(homes, 'home', 'homes'),
    addType: 'Add another type',
    finish: 'Finish setting up',
    finishType: (type: string) => `Finish setting up ${type}`,
    viewing: 'Offer a viewing time',
    viewingLead: 'One time for every home of this type: each home keeps its own people.',
    change: 'Change',
    shared: 'Shared by the homes',
    noHomes: 'No homes added yet.',
    /** Lettings: developments with no homes yet. */
    starting: 'Developments being set up',
    ownValues: 'Changed on this home',
    publicPage: 'See its page on Gaff',
    homesOf: (type: string) => `Homes of ${type}`,
    typeLine: (homes: number, rentCents: number | null) =>
      [plural(homes, 'home', 'homes'), rentCents ? `${formatRent(rentCents)} each` : null]
        .filter(Boolean)
        .join(' · '),
    whatNext:
      'Add each type of home in the development. Gaff makes the homes, and you put them live together.',
  },
  /** Calendar: one time for every home of a type. */
  calendar: {
    allOfType: (homes: number, type: string, development: string) =>
      `All ${homes} homes of ${type}, ${development}`,
    added: (homes: number) => `Viewing time added to ${plural(homes, 'home', 'homes')}`,
  },

  // The public side (M75).
  public: {
    homesFree: (n: number) => `${plural(n, 'home', 'homes')} free`,
    typeLine: (free: number, fromCents: number) => `${free} free · from ${formatRent(fromCents)}`,
    floorArea: (sqm: number) => `${sqm} m²`,
    about: 'About the development',
    homes: 'Homes here',
    ber: 'Energy rating',
    parking: 'Parking',
    letBy: 'Let by',
    whatNext: 'Open a home to ask to view it. You’ll hear back either way.',
    homeLine: (unit: string, floor: number | null) =>
      floor === null ? unit : `${unit} · ${floor === 0 ? 'ground floor' : `floor ${floor}`}`,
    notAvailable: {
      title: 'This development isn’t on Gaff',
      text: 'Its homes may have been let, or taken off Gaff. Homes are added every week.',
      action: 'See homes on Gaff',
    },
  },
  /** On a home's page: the development it is part of. */
  partOf: (name: string) => `Part of ${name}`,
  /** Search: one card for a development's alike homes. */
  search: {
    from: (cents: number) => `From ${formatRent(cents)}`,
    alike: (n: number) => `${n} homes like this`,
    line: (type: string, development: string) => `${type} at ${development}`,
  },
} as const;
