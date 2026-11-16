import { propertyTypes } from '@/domain/lettings/new-letting';
import { licenceToShow } from '@/domain/organisations/go-live-gate';
import type { OrganisationKind } from '@/domain/organisations/kinds';
import { formatDate, formatRent } from '@/lib/format';

/**
 * The rules of the frame every private page stands in (UX-PP-1 to UX-PP-10): the pages a renter,
 * a tenant, an owner or a referee reaches by a link, with no account. The frame is the header,
 * the home, the task, what happens next, and the footer. These rules say which header and footer
 * each reader gets, and what the home's one summary line says at each stage.
 */

/** Who the page is for. A tenant is a renter whose offer was accepted: the same frame. */
export type FrameAudience = 'renter' | 'owner' | 'referee';

/** Whoever is letting the home: an agency, or a landlord letting their own. */
export interface Lister {
  name: string;
  /**
   * The agency's PSRA licence number, from its entry in the register, once the agency is
   * confirmed (UX-AG-7). A landlord has none.
   */
  licence: string | null;
  /** A number a renter can ring instead of using Gaff (Q43), where the lister has given one. */
  phone: string | null;
  /** The local part of the lister's Gaff address. Its privacy notice lives under it. */
  slug: string;
}

/**
 * The lister, from its organisation.
 *
 * THE PHONE NUMBER'S SEAM (Q43, UX-PP-3): organisations have no phone number yet. The package
 * that adds one adds the column and selects it wherever an organisation is loaded for a private
 * page or an email (`listerColumns` in `src/server/frame/lister.ts`); it arrives here as `phone`,
 * and "Talk to a person" shows it with nothing else to change. The component page shows the
 * sheet with a made-up number (`/dev/ui/frame`), and a journey holds it to that.
 */
export function listerFrom(organisation: {
  name: string;
  kind: OrganisationKind;
  psraLicenceNumber: string | null;
  /** UX-AG-7: when someone at Gaff confirmed the agency. Until then no licence is shown. */
  confirmedAt: Date | null;
  inboundSlug: string;
  phone?: string | null;
}): Lister {
  return {
    name: organisation.name,
    licence: licenceToShow(organisation),
    phone: organisation.phone?.trim() || null,
    slug: organisation.inboundSlug,
  };
}

export type FrameHeader =
  | { brand: 'wordmark'; talkToAPerson: boolean }
  | { brand: 'lister'; name: string; talkToAPerson: boolean };

/**
 * UX-PP-3: a renter's page carries Gaff's wordmark, and "Talk to a person" on every page.
 * UX-PP-9 (Q45): an owner's or a referee's page carries the agency's name instead. A link that
 * has ended names no lister, so its header is the wordmark alone.
 */
export function frameHeader(audience: FrameAudience, lister: Lister | null): FrameHeader {
  if (audience === 'renter') return { brand: 'wordmark', talkToAPerson: true };
  if (!lister) return { brand: 'wordmark', talkToAPerson: false };
  return { brand: 'lister', name: lister.name, talkToAPerson: false };
}

/**
 * "Let by Halcyon Lettings", under the home on a renter's page. An owner's page names the agency
 * in its header instead (UX-PP-9), and it is the owner's own home.
 */
export function letBy(audience: FrameAudience, lister: Lister | null): string | null {
  return audience === 'renter' && lister ? lister.name : null;
}

export interface FrameFooter {
  listerName: string | null;
  /** The PSRA licence number, only where there is one. */
  licence: string | null;
  /** The lister's privacy notice. It is written for renters, so only they are sent to it. */
  privacyHref: string | null;
  /** An owner or a referee is told how to reach the agency; a renter has "Talk to a person". */
  reachLister: boolean;
  /** UX-PP-9 (Q45): one quiet line under an agency's name. Never an invitation to use Gaff. */
  runWithGaff: boolean;
}

export function frameFooter(audience: FrameAudience, lister: Lister | null): FrameFooter {
  const forRenter = audience === 'renter';
  return {
    listerName: lister?.name ?? null,
    licence: lister?.licence ?? null,
    privacyHref: lister && forRenter ? `/privacy/${lister.slug}` : null,
    reachLister: lister !== null && !forRenter,
    runWithGaff: lister !== null && !forRenter,
  };
}

/** What the frame's home block needs to know about the home. No person's details. */
export interface FrameHome {
  addressLine1: string;
  area: string;
  monthlyRentCents: number;
  bedrooms: number;
  propertyType: string;
  availableFrom: string;
  status: 'draft' | 'live' | 'let' | 'withdrawn';
  /** Only on the tenant's own pages: the day their tenancy starts. */
  tenancyStartDate?: string | null;
}

/** The home block's facts, from a letting. Pass the tenancy's start date only on a tenant's page. */
export function homeFrom(
  letting: Omit<FrameHome, 'tenancyStartDate'>,
  tenancyStartDate: string | null = null,
): FrameHome {
  return {
    addressLine1: letting.addressLine1,
    area: letting.area,
    monthlyRentCents: letting.monthlyRentCents,
    bedrooms: letting.bedrooms,
    propertyType: letting.propertyType,
    availableFrom: letting.availableFrom,
    status: letting.status,
    tenancyStartDate,
  };
}

export function kindOfHome(home: Pick<FrameHome, 'bedrooms' | 'propertyType'>): string {
  if (home.propertyType === 'studio') return propertyTypes.studio;
  const known = propertyTypes[home.propertyType as keyof typeof propertyTypes];
  const type = known && home.propertyType !== 'other' ? known.toLowerCase() : 'home';
  return `${home.bedrooms}-bed ${type}`;
}

/**
 * UX-PP-5: the home's one summary line fits its stage. Before it's let: "€1,850 a month · 2-bed
 * apartment · From Sunday 13 December". For the tenant, "From" is the day their tenancy starts.
 * Once the home is let or withdrawn, "From" is dropped for everyone else.
 */
export function homeSummaryLine(home: FrameHome, now: Date = new Date()): string {
  const from = home.tenancyStartDate
    ? home.tenancyStartDate
    : home.status === 'let' || home.status === 'withdrawn'
      ? null
      : home.availableFrom;
  return [
    formatRent(home.monthlyRentCents),
    kindOfHome(home),
    ...(from ? [`From ${formatDate(from, now)}`] : []),
  ].join(' · ');
}

export interface WaysToReachAPerson {
  /** Replying to any email reaches a person. Always there. */
  email: true;
  /** The lister's number as they gave it, and as a link a phone can ring. */
  phone: { shown: string; href: string } | null;
}

/**
 * UX-PP-3, UX-AI-2 (rule 6): a renter can always reach a person. Replying to any email always
 * works; the lister's phone number is offered beside it when there is one (Q43).
 */
export function reachAPerson(lister: Lister | null): WaysToReachAPerson {
  const phone = lister?.phone ?? null;
  return {
    email: true,
    phone: phone ? { shown: phone, href: `tel:${phone.replace(/[^\d+]/g, '')}` } : null,
  };
}
