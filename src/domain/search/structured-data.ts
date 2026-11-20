import { streetOf } from '@/domain/places/street';
import {
  homeDescription,
  homeTitle,
  type HomeFacts,
  type PublicLister,
} from '@/domain/homes/home-page';

/**
 * M111 (BA-12): structured data on a live home's page, so search engines can read it. Built only
 * from what the page itself shows (UX-LS-2): the home's facts, the rent, when it's free, its
 * photos and its description as the page shows it. Never an Eircode, a second address line, a
 * point on the map or anyone's name, and nothing about who is letting it.
 *
 * A landlord's home is a private person's property: its address is given as the street alone,
 * with no door number (as its point is never shown at its door, M38). An agency's home is given
 * as the page titles it.
 */
export interface StructuredHome {
  /** The page's full web address. */
  url: string;
  home: HomeFacts;
  lister: PublicLister;
  /** The photos' full web addresses, in the page's order. */
  imageUrls: readonly string[];
}

const schemaType: Record<string, string> = {
  apartment: 'Apartment',
  studio: 'Apartment',
  duplex: 'Apartment',
  house: 'House',
};

/** The address as structured data gives it: an agency's as the page titles it; a landlord's, the street alone. */
export function structuredStreet(
  home: Pick<HomeFacts, 'addressLine1'>,
  lister: PublicLister,
): string {
  return lister.kind === 'agency' ? home.addressLine1.trim() : streetOf(home.addressLine1);
}

export function homeStructuredData({
  url,
  home,
  lister,
  imageUrls,
}: StructuredHome): Record<string, unknown> {
  const euros = home.monthlyRentCents / 100;
  const street = structuredStreet(home, lister);
  const description = homeDescription(home.description).join('\n\n');
  const pets = home.criteria ? { petsAllowed: !home.criteria.noPets } : {};
  return {
    '@context': 'https://schema.org',
    '@type': schemaType[home.propertyType] ?? 'Accommodation',
    name: homeTitle({ addressLine1: street, area: home.area }),
    url,
    ...(description ? { description: description.slice(0, 500) } : {}),
    ...(imageUrls.length ? { image: [...imageUrls] } : {}),
    numberOfBedrooms: home.bedrooms,
    ...(home.bathrooms ? { numberOfBathroomsTotal: home.bathrooms } : {}),
    ...pets,
    address: {
      '@type': 'PostalAddress',
      streetAddress: street,
      addressLocality: home.area,
      addressRegion: `County ${home.county}`,
      addressCountry: 'IE',
    },
    offers: {
      '@type': 'Offer',
      businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
      price: euros,
      priceCurrency: 'EUR',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: euros,
        priceCurrency: 'EUR',
        unitCode: 'MON',
      },
      availabilityStarts: home.availableFrom,
      availability: 'https://schema.org/InStock',
    },
  };
}

/** JSON for a <script type="application/ld+json">, safe to put in HTML: no "</script>". */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
