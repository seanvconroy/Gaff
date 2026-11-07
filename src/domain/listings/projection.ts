import { describeCriteria, questionsFor, type Criteria } from '@/domain/criteria/criteria';
import { berBand, berLabel, type Ber } from '@/domain/homes/ber';
import { propertyTypes } from '@/domain/homes/facts';
import { approximate } from '@/domain/places/geo';
import { slugify } from '@/domain/places/slug';
import type { PublicStatus } from './lifecycle';

/**
 * ADR-0017: what renters see of a listing, built from the letting, the home and the letter's
 * public details. Nothing else reaches public_listings: no Eircode, no landlord client, no
 * renter data. Values are codes where a word list renders them, so the page can change words
 * without republishing.
 */

export interface ProjectionHome {
  addressLine1: string;
  addressLine2: string | null;
  area: string;
  county: string;
  routingKey: string | null;
  latitude: number;
  longitude: number;
  showExactAddress: boolean;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  ensuites: number | null;
  floorAreaSqm: number | null;
  floor: number | null;
  hasLift: boolean | null;
  ber: Ber;
  heating: string | null;
  parking: string | null;
  outdoorSpace: string | null;
  accessibility: string[];
  appliances: string[];
  broadband: string | null;
  developmentId: string | null;
}

export interface ProjectionPhoto {
  key: string;
  kind: 'photo' | 'floor_plan';
  widths: number[];
  width: number;
  height: number;
  alt: string | null;
  placeholder: string | null;
  cgi: boolean;
}

export interface ProjectionLetter {
  kind: 'agency' | 'landlord';
  /** The agency's trading name, or a private landlord's first name (M19). */
  name: string;
  agentName: string | null;
  agentPhone: string | null;
  badges: string[];
}

/** A viewing time as the public page shows it: no names, no bookings (M47, M69). */
export interface PublicViewing {
  startsAt: string;
  endsAt: string;
  kind: 'slots' | 'group';
}

export interface ProjectionInput {
  listingId: string;
  organisationId: string;
  slug: string;
  status: PublicStatus;
  home: ProjectionHome;
  rentCents: number;
  depositCents: number;
  availableFrom: string;
  furnished: string;
  criteria: Criteria;
  enquiriesCloseAt: Date | null;
  description: string;
  tourUrl: string | null;
  photos: ProjectionPhoto[];
  letter: ProjectionLetter;
  publishedAt: Date;
  confirmedAt: Date;
  /** Upcoming viewing times; the page shows only those still to come. */
  viewings: PublicViewing[];
  /** M74: when the home was let or withdrawn. */
  closedAt: Date | null;
}

/** "2 bed apartment in Ranelagh, Dublin 6"; "Studio in Rathmines, Dublin 6". */
export function listingTitle(
  home: Pick<ProjectionHome, 'bedrooms' | 'propertyType' | 'area'>,
): string {
  const type = (
    propertyTypes[home.propertyType as keyof typeof propertyTypes] ?? 'Home'
  ).toLowerCase();
  const what =
    home.propertyType === 'studio' || home.bedrooms === 0
      ? 'Studio'
      : `${home.bedrooms} bed ${type}`;
  return `${what} in ${home.area}`;
}

/** M38: the exact address, or just the street and area if the letter chose that. */
export function addressShown(
  home: Pick<ProjectionHome, 'addressLine1' | 'addressLine2' | 'area' | 'showExactAddress'>,
): string {
  if (home.showExactAddress) {
    return [home.addressLine1, home.addressLine2, home.area].filter(Boolean).join(', ');
  }
  return [streetOf(home.addressLine1), home.area].filter(Boolean).join(', ');
}

/** "Apartment 4, 12 Ranelagh Road" → "Ranelagh Road": the street, without the home's number. */
export function streetOf(addressLine1: string): string {
  return addressLine1
    .replace(/^(apartment|apt\.?|flat|unit|no\.?)\s*[\w-]+,?\s*/i, '')
    .replace(/^\d+[a-z]?\s*,?\s*/i, '')
    .trim();
}

/** Statuses at which a renter has been invited to view, or gone further. */
const invitedOrLater = new Set([
  'invited',
  'booked',
  'attended',
  'no_show',
  'applied',
  'preferred',
  'backup',
  'offered',
  'accepted',
  'declined',
  'not_chosen',
]);

/**
 * M38: if the letter chose to show only the street, a renter sees the exact address once
 * they're invited to view, and not before: not in the first reply, answers, waiting-list or
 * closing messages, nor on their page.
 */
export function addressForRenter(
  addressLine1: string,
  showExactAddress: boolean,
  status: string,
): string {
  return showExactAddress || invitedOrLater.has(status) ? addressLine1 : streetOf(addressLine1);
}

/** A stable web address for the listing, given at first publish. */
export function listingSlug(title: string, listingId: string): string {
  return `${slugify(title).slice(0, 70).replace(/-+$/, '')}-${listingId.slice(0, 8)}`;
}

/** M59: how complete a listing is, 0 to 100, used to break ties in "Best match". */
export function completeness(
  input: Pick<ProjectionInput, 'photos' | 'description' | 'tourUrl' | 'home'>,
): number {
  const photos = input.photos.filter((p) => p.kind === 'photo').length;
  let score = Math.min(photos, 8) * 5;
  if (input.photos.some((p) => p.kind === 'floor_plan')) score += 15;
  if (input.home.floorAreaSqm) score += 15;
  if (input.description.trim().length >= 400) score += 20;
  if (input.tourUrl) score += 10;
  return score;
}

export function buildPublicListing(input: ProjectionInput, now: Date = new Date()) {
  const { home } = input;
  const point = home.showExactAddress
    ? { lat: home.latitude, lng: home.longitude }
    : approximate({ lat: home.latitude, lng: home.longitude });
  return {
    listingId: input.listingId,
    organisationId: input.organisationId,
    slug: input.slug,
    status: input.status,
    title: listingTitle(home),
    addressShown: addressShown(home),
    area: home.area,
    county: home.county,
    routingKey: home.routingKey,
    latitude: point.lat,
    longitude: point.lng,
    rentCents: input.rentCents,
    depositCents: input.depositCents,
    propertyType: home.propertyType,
    bedrooms: home.bedrooms,
    bathrooms: home.bathrooms,
    furnished: input.furnished,
    availableFrom: input.availableFrom,
    berLabel: berLabel(home.ber),
    berBand: berBand(home.ber),
    petsConsidered: !input.criteria.noPets,
    facts: {
      heating: home.heating,
      parking: home.parking,
      outdoorSpace: home.outdoorSpace,
      accessibility: home.accessibility,
      appliances: home.appliances,
      broadband: home.broadband,
      floorAreaSqm: home.floorAreaSqm,
      floor: home.floor,
      hasLift: home.hasLift,
      ensuites: home.ensuites,
    },
    criteria: describeCriteria(input.criteria, now),
    questions: questionsFor(input.criteria),
    photos: input.photos.map((p) => ({ ...p })),
    letter: { ...input.letter },
    description: input.description.trim(),
    tourUrl: input.tourUrl,
    developmentId: home.developmentId,
    publishedAt: input.publishedAt,
    confirmedAt: input.confirmedAt,
    enquiriesCloseAt: input.enquiriesCloseAt,
    completeness: completeness(input),
    viewings: input.viewings
      .filter((v) => v.endsAt > now.toISOString())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    closedAt: input.status === 'let' || input.status === 'withdrawn' ? input.closedAt : null,
  };
}

export type PublicListingValues = ReturnType<typeof buildPublicListing>;
