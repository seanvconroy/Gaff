import { homesCount } from './search';

/**
 * M62, M59 (BA-12): the words of a place's page (`/to-rent/<county>/<place>`) and of "How
 * results are ordered". Plain, warm Irish English, in search's own voice (UX-SR-1 to UX-SR-9).
 * Nothing here hurries anyone, counts interest, or says who a place or a home would suit
 * (rule 3, UX-LS-9).
 */
export const placePageCopy = {
  /** The page's heading, which also names its search box: "Homes to rent in Ranelagh". */
  heading: (name: string) => `Homes to rent in ${name}`,
  /** The one line under the box: the place, and how many homes are free there. */
  free: (count: number, label: string) =>
    count === 0
      ? `No homes free in ${label} on Gaff just now.`
      : `${homesCount(count)} free to rent in ${label} on Gaff.`,
  /** For search engines' listing and a link's preview. */
  description: (name: string) =>
    `Homes to rent in ${name} on Gaff. Free for renters, and everyone hears back.`,
  /** The places around it. */
  nearby: (name: string) => `Places near ${name}`,
  /** A county's own towns and areas. */
  inCounty: (name: string) => `Places in ${name}`,
  /** Its county's page. */
  county: (name: string) => `All homes in ${name}`,
  /** A place with no homes: wider places that have some. */
  wider: 'Places nearby with homes',
  withHomes: (name: string, count: number) => `${name} · ${homesCount(count).toLowerCase()}`,
  /** No homes anywhere near. */
  everywhere: 'See every home on Gaff',
  /** An address under /to-rent that names no place Gaff knows. */
  notFound: {
    title: 'Gaff doesn’t know that place yet',
    text: 'Try searching for a town, a Dublin district or a county. Homes are added every week.',
    action: 'Search homes',
  },
} as const;

/** M59: "How results are ordered", linked from under the results. */
export const resultsOrderCopy = {
  title: 'How results are ordered',
  description:
    'How Gaff orders homes in a search: the same for everyone, and nobody can pay to be higher.',
  footLink: 'How results are ordered',
  intro:
    'Gaff puts homes in the same order for everyone who asks for the same thing. Here is that order, and what never changes it.',
  order: {
    heading: 'The order',
    fits: 'Homes that fit everything you asked come first, newest first.',
    close:
      'Then come homes close to what you asked. Each one misses on one point and says which, in words: “Up to 2 people. You asked for 3.” They are newest first too.',
    nearest:
      'When no home is where you searched, the nearest homes that fit the rest of what you asked are shown, nearest first, each saying how far it is.',
    nothing: 'With nothing asked, every home on Gaff is shown, newest first.',
  },
  never: {
    heading: 'What never changes it',
    pay: 'Nobody can pay to be higher, now or later. Listing a home doesn’t buy a place in search.',
    you: 'Nothing about you. The order reads only the homes and what you asked for. Searching needs no account, and a search isn’t kept unless you save it.',
  },
  people: {
    heading: 'Gaff never recommends a person',
    text: 'When you ask to view, Gaff never scores you or recommends you. Whoever lets the home sees who meets what they asked, and the order people asked in. A person there decides who views.',
  },
  next: {
    text: 'Homes on Gaff are on the first page, newest first.',
    action: 'Search homes',
  },
} as const;
