import { firstNameOf } from '@/domain/accounts/first-run';
import { homeWordingReason } from '@/domain/compliance/who-should-apply';
import { type Criteria, lettingDetailsParts } from '@/domain/criteria/criteria';
import { kindOfHome } from '@/domain/frame/frame';
import { type MoreFacts, moreFactHighlights } from '@/domain/lettings/more-facts';
import { furnishing, parkingOptions } from '@/domain/lettings/new-letting';
import { previewBer } from '@/domain/lettings/preview';
import { onGaffNeeds } from '@/domain/lettings/setup';
import { goLiveGate, licenceToShow } from '@/domain/organisations/go-live-gate';
import type { OrganisationKind } from '@/domain/organisations/kinds';
import { formatDate, formatRent, irishToday } from '@/lib/format';

/**
 * A home's public page on Gaff (UX-LS-1 to UX-LS-11, UX-LT-21): when there is one, at what
 * address, and what it says. Everything on it is a fact about the home, the four fixed criteria
 * written in Gaff's own words, or the lister as renters may know them (rule 3). Nothing here is
 * about a renter, an owner or who has enquired.
 */

/**
 * The page's address: `/homes/<ref>`. The ref is twelve random hex characters, given to a
 * letting when it is made and never changed, so a shared link keeps working whatever is edited.
 * It is not the letting's ID and names no home and no person: the address, the rent and the
 * lister stay out of the web address, because a private landlord's own home is personal data and
 * web addresses travel (rule 8).
 */
export const PUBLIC_REF = /^[0-9a-f]{12}$/;

export function isPublicRef(value: string): boolean {
  return PUBLIC_REF.test(value);
}

export const homeHref = (ref: string) => `/homes/${ref}`;

/**
 * UX-LS-11: whether search engines may index a home's page. Only a live home's, and only where
 * the deployment says so (`SEARCH_INDEXING=on`, set in production alone), so a test copy of
 * Gaff is never found.
 */
export function homePageRobots(page: { live: boolean; searchIndexing: boolean }): {
  index: boolean;
  follow: boolean;
} {
  const index = page.live && page.searchIndexing;
  return { index, follow: index };
}
/** Asking to view (WP-22, UX-AV-1). With search's answers carried in: `askHref` in search/links. */
export const askToViewHref = (ref: string) => `/homes/${ref}/ask`;
/**
 * UX-LS-10: "See other homes in Ranelagh". THE SEAM for work package WP-21, whose search reads
 * the place from `where` (UX-SR-12: a search's address holds its filters and nothing personal).
 */
export const homesInHref = (place: string) => `/?${new URLSearchParams({ where: place })}`;
/** UX-TS-3: "Report this listing". Where a report goes is work package WP-26. */
export const reportHref = (ref: string) => `/homes/${ref}/report`;

/** Whoever lists the home, as their organisation holds them. */
export interface ListerFacts {
  kind: OrganisationKind;
  name: string;
  psraLicenceNumber: string | null;
  confirmedAt: Date | null;
  licenceLapsedAt: Date | null;
  /** A private landlord's verified identity, as a date alone (`goLiveGate`). */
  identityVerifiedAt: Date | null;
}

/**
 * UX-TS-1 (rule 5): a home can be public only while its lister may have it live: an agency whose
 * licence is on the register and which Gaff's team has confirmed, a private landlord who has
 * confirmed it's them (Q47), or a landlord's team. The one rule is `goLiveGate`; the public
 * query's SQL twin (`listerMayShow` in src/server/homes/public-homes.ts) says the same.
 */
export function listerMayShowHomes(lister: ListerFacts): boolean {
  return goLiveGate(lister).open;
}

/**
 * "Let by": an agency by name with its licence; a landlord by first name only (UX-LS-7). A
 * private landlord's homes say "Identity verified" beside their first name (Q47): it's the only
 * way they can be public at all, and it says nothing more about them.
 */
export type PublicLister =
  | { kind: 'agency'; name: string; licence: string | null }
  | { kind: 'landlord'; name: string; identityVerified: boolean };

export function publicLister(lister: ListerFacts): PublicLister {
  if (lister.kind === 'agency') {
    return { kind: 'agency', name: lister.name.trim(), licence: licenceToShow(lister) };
  }
  // A private landlord is one person: their first name, never more. A landlord's team has a
  // name of its own, which is how it asked renters to know it.
  if (lister.kind === 'private_landlord') {
    return {
      kind: 'landlord',
      name: firstNameOf(lister.name),
      identityVerified: lister.identityVerifiedAt !== null,
    };
  }
  return { kind: 'landlord', name: lister.name.trim(), identityVerified: false };
}

/** What decides whether a home's page shows, and how. */
export interface HomeVisibility {
  status: 'draft' | 'live' | 'let' | 'withdrawn';
  onGaff: boolean;
  berRating: string | null;
  photos: number;
  /** WP-26: Gaff's team hid it after a report. */
  hiddenAt: Date | null;
  /** When the scheduled job took a let home's page down. */
  pageRemovedAt: Date | null;
  listerMayShow: boolean;
  /** M49 (BA-13): it stepped back, unconfirmed, until its lister says it's still available. */
  staleAt?: Date | null;
}

/**
 * UX-LT-21, UX-LS-1, UX-LS-10: what a home's address shows.
 * - `live`: the page. A live home, "On gaff.ie" on, with a BER and a photo, not hidden, whose
 *   lister may have it live.
 * - `let`: "This home has been let", until the scheduled job removes it 30 days later.
 * - `not_available`: anything else, the same for a home that never existed. Switching "On
 *   gaff.ie" off moves a home here at once.
 */
export type HomePageState = 'live' | 'let' | 'not_available';

export function homePageState(home: HomeVisibility): HomePageState {
  const shown =
    home.onGaff &&
    !home.hiddenAt &&
    home.listerMayShow &&
    onGaffNeeds({ berRating: home.berRating, photos: home.photos }).length === 0;
  if (!shown) return 'not_available';
  // M49: a live home nobody has confirmed steps back until they do. A let one says so as ever.
  if (home.status === 'live') return home.staleAt ? 'not_available' : 'live';
  if (home.status === 'let' && !home.pageRemovedAt) return 'let';
  return 'not_available';
}

/** UX-LS-10: a let home's page says so for 30 days, then the scheduled job removes it. */
export const LET_PAGE_DAYS = 30;

export function letPageDue(letAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - letAt.getTime() >= LET_PAGE_DAYS * 86_400_000;
}

/** The facts about a home its page is made from (UX-LS-2). No person's details. */
export interface HomeFacts {
  addressLine1: string;
  area: string;
  county: string;
  monthlyRentCents: number;
  availableFrom: string;
  propertyType: string;
  bedrooms: number;
  bathrooms: number | null;
  furnished: string | null;
  parking: string | null;
  berRating: string | null;
  description: string | null;
  criteria: Criteria | null;
  noSmokingIndoors: boolean;
  /** "Anything else renters often ask?", a line each, as set up. */
  facts: readonly string[];
  /** M39, M40, M44 (BA-14): en-suites, floor area, floor and lift, heating and the rest. */
  more?: MoreFacts;
}

/** Words about the home that pass the wording check (rule 3, UX-LS-6). Anything else is left out. */
function passes(text: string): boolean {
  return homeWordingReason(text) === null;
}

/** The title: the address, as renters know the home. */
export function homeTitle(home: Pick<HomeFacts, 'addressLine1' | 'area'>): string {
  return `${home.addressLine1}, ${home.area}`;
}

/** "€1,850 a month · 2-bed apartment · Furnished". */
export function homeSummary(
  home: Pick<HomeFacts, 'monthlyRentCents' | 'propertyType' | 'bedrooms' | 'furnished'>,
): string {
  const furnished = furnishing[home.furnished as keyof typeof furnishing];
  return [
    formatRent(home.monthlyRentCents),
    kindOfHome(home),
    ...(furnished ? [furnished] : []),
  ].join(' · ');
}

export type HighlightKind =
  | 'bedrooms'
  | 'bathrooms'
  | 'furnished'
  | 'parking'
  | ReturnType<typeof moreFactHighlights>[number]['key']
  | 'fact';
export interface Highlight {
  kind: HighlightKind;
  text: string;
}

/** UX-LS-2: up to five highlights show; "Show all" opens the rest. */
export const HIGHLIGHTS_SHOWN = 5;

/**
 * UX-LS-2: the home's facts as highlights: bedrooms, bathrooms, furnishing, parking, then
 * anything else the lister said about the home. The type and rent are in the title's summary,
 * and the BER has a block of its own (UX-LS-8), so neither is repeated.
 */
export function homeHighlights(home: HomeFacts): Highlight[] {
  const highlights: Highlight[] = [];
  if (home.bedrooms > 0) {
    highlights.push({
      kind: 'bedrooms',
      text: `${home.bedrooms} ${home.bedrooms === 1 ? 'bedroom' : 'bedrooms'}`,
    });
  }
  if (home.bathrooms) {
    highlights.push({
      kind: 'bathrooms',
      text: `${home.bathrooms} ${home.bathrooms === 1 ? 'bathroom' : 'bathrooms'}`,
    });
  }
  const furnished = furnishing[home.furnished as keyof typeof furnishing];
  if (furnished) highlights.push({ kind: 'furnished', text: furnished });
  const parking = parkingOptions[home.parking as keyof typeof parkingOptions];
  if (parking) highlights.push({ kind: 'parking', text: parking });
  // M39 (BA-14): the further facts, each a short phrase about the home or its building.
  for (const more of moreFactHighlights(home.more ?? {})) {
    highlights.push({ kind: more.key, text: more.text });
  }
  for (const fact of home.facts) {
    const text = fact.trim();
    if (text && passes(text)) highlights.push({ kind: 'fact', text });
  }
  return highlights;
}

/**
 * UX-LS-5, UX-MT-3: "Letting details", written by Gaff: when the home is free, then the four
 * fixed criteria and the house rule in their fixed words. Never "who it suits".
 */
export function homeLettingDetails(
  home: Pick<HomeFacts, 'availableFrom' | 'criteria' | 'noSmokingIndoors'>,
  now: Date = new Date(),
): string[] {
  const from =
    home.availableFrom <= irishToday(now)
      ? 'Available now'
      : `Available from ${formatDate(home.availableFrom, now)}`;
  return [from, ...lettingDetailsParts(home.criteria, home.noSmokingIndoors, now)];
}

/**
 * UX-LS-6: the lister's own description, as paragraphs. It was checked when it was typed; it is
 * checked again here, and a paragraph that says who should live there is left out, so nothing on
 * a public page can (rule 3). Empty when there is nothing to show.
 */
export function homeDescription(description: string | null): string[] {
  if (!description) return [];
  return description
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && passes(paragraph));
}

/** UX-LS-8: "BER C1" or "BER exempt". A home on Gaff always has one. */
export function homeBer(berRating: string | null): string | null {
  return previewBer(berRating);
}

/** "Ranelagh", from "Ranelagh, Dublin 6": the place for "See other homes in Ranelagh". */
export function placeOf(area: string): string {
  return area.split(',')[0]?.trim() || area.trim();
}

/**
 * UX-LS-11: a sharing preview: the address, the rent and the photo. Nothing about a person; the
 * lister isn't named.
 */
export function sharePreview(
  home: Pick<
    HomeFacts,
    'addressLine1' | 'area' | 'monthlyRentCents' | 'propertyType' | 'bedrooms' | 'furnished'
  >,
): { title: string; description: string } {
  return { title: homeTitle(home), description: homeSummary(home) };
}
