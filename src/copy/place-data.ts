/**
 * M56 (ADR-0018): the words of "Map and place data", the page that credits where Gaff's place
 * search comes from. OpenStreetMap's licence (the ODbL) asks for its credit, and for an offer of
 * the data Gaff built from it. Plain, warm Irish English; reviewed before launch with the other
 * public pages.
 */
export const placeDataCopy = {
  title: 'Map and place data',
  description: 'Where the places in Gaff’s search come from, and the credit they carry.',
  places: {
    heading: 'Places you can search',
    built:
      'When you type a county, a town, an area, a street or a landmark under “Where”, Gaff suggests places from its own index. Gaff built it from OpenStreetMap, the map anyone can edit:',
    credit: '© OpenStreetMap contributors, under the Open Database Licence',
    creditHref: 'https://www.openstreetmap.org/copyright',
    added:
      'Gaff adds the counties, Dublin’s postal districts and its best-known areas itself, and rebuilds the index every three months.',
    open: 'Gaff’s index is open data too, under the same licence. The method that builds it is kept with Gaff’s own code, and Gaff’s team will send a copy of either to anyone who asks.',
  },
  typing: {
    heading: 'What you type',
    text: 'What you type goes only to Gaff, never to a map or address company. If a place can’t be found, Gaff counts the words, with no numbers and nothing about you, so the place can be added. The count is deleted after 30 days.',
  },
  next: {
    text: 'Homes on Gaff are on the first page, newest first.',
    action: 'Search homes',
  },
  /** The link to this page under search. */
  footLink: 'Map and place data',
} as const;
