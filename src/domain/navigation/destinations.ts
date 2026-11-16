/**
 * The navigation's destinations (UX redesign, section 3). Anyone running lettings has exactly
 * four (UX-NV-1); a renter has three in the same bar (UX-NV-19). Nothing else is added to the
 * bar: everything else is in the account menu. Each label is one word, so it never wraps under
 * its icon on a phone (UX-NV-4).
 */
export type Side = 'letting' | 'renting';

export interface Destination {
  key: string;
  label: string;
  href: string;
  /** The addresses that belong to it: each one, and everything under it. `/` is itself alone. */
  pages: readonly string[];
}

export const lettingDestinations = [
  { key: 'today', label: 'Today', href: '/today', pages: ['/today'] },
  { key: 'lettings', label: 'Lettings', href: '/lettings', pages: ['/lettings'] },
  { key: 'calendar', label: 'Calendar', href: '/calendar', pages: ['/calendar'] },
  {
    key: 'inbox',
    label: 'Inbox',
    href: '/inbox',
    // UX-NV-2: approvals, questions and needs attention are handled in Inbox. Their pages stay
    // until work package WP-8 rebuilds Inbox, and they belong to it.
    pages: ['/inbox', '/approvals', '/questions', '/attention'],
  },
] as const satisfies readonly Destination[];

export const rentingDestinations = [
  { key: 'search', label: 'Search', href: '/', pages: ['/'] },
  { key: 'saved', label: 'Saved', href: '/saved', pages: ['/saved'] },
  { key: 'enquiries', label: 'Enquiries', href: '/enquiries', pages: ['/enquiries'] },
] as const satisfies readonly Destination[];

export type DestinationKey =
  (typeof lettingDestinations)[number]['key'] | (typeof rentingDestinations)[number]['key'];

export function destinationsFor(side: Side): readonly Destination[] {
  return side === 'letting' ? lettingDestinations : rentingDestinations;
}

/** Whether an address is one of a destination's pages. */
export function isOnDestination(destination: Pick<Destination, 'pages'>, pathname: string) {
  return destination.pages.some((page) =>
    page === '/' ? pathname === '/' : pathname === page || pathname.startsWith(`${page}/`),
  );
}

/** The destination to mark as the page you're on, if the address belongs to one. */
export function currentDestination(side: Side, pathname: string): Destination | null {
  return destinationsFor(side).find((d) => isOnDestination(d, pathname)) ?? null;
}
