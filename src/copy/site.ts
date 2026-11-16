/**
 * The words renters and visitors see on Gaff's own pages: the header, and the first screens of
 * the renting side. Plain, warm Irish English; each empty screen says what will appear there.
 * Search, saved homes and a renter's enquiries are built by later work packages (WP-21, WP-23,
 * WP-12 and WP-14); until then each destination is an honest empty state.
 */
export const siteCopy = {
  header: {
    listAHome: 'List a home',
    signIn: 'Sign in',
  },
  search: {
    title: 'Search',
    empty: 'Homes to rent will appear here.',
  },
  saved: {
    title: 'Saved',
    empty: 'Homes you save appear here.',
    action: 'Search homes',
  },
  enquiries: {
    title: 'Enquiries',
    empty: 'Homes you ask to view appear here.',
    action: 'Search homes',
  },
} as const;
