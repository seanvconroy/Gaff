/**
 * M111: structured data, so search engines can read listings and area pages. Built only from
 * what the public page already shows: the address the letter chose to show, never an Eircode
 * or anyone's name.
 */

export interface StructuredListing {
  title: string;
  url: string;
  description: string;
  imageUrls: string[];
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  floorAreaSqm: number | null;
  petsConsidered: boolean;
  addressShown: string;
  area: string;
  county: string;
  latitude: number;
  longitude: number;
  rentCents: number;
  availableFrom: string;
  takingEnquiries: boolean;
}

const schemaType: Record<string, string> = {
  apartment: 'Apartment',
  studio: 'Apartment',
  duplex: 'Apartment',
  house: 'House',
  bungalow: 'House',
  townhouse: 'House',
};

export function listingStructuredData(listing: StructuredListing): Record<string, unknown> {
  const euros = listing.rentCents / 100;
  return {
    '@context': 'https://schema.org',
    '@type': schemaType[listing.propertyType] ?? 'Accommodation',
    name: listing.title,
    url: listing.url,
    ...(listing.description ? { description: listing.description.slice(0, 500) } : {}),
    ...(listing.imageUrls.length ? { image: listing.imageUrls } : {}),
    numberOfBedrooms: listing.bedrooms,
    numberOfBathroomsTotal: listing.bathrooms,
    ...(listing.floorAreaSqm
      ? {
          floorSize: {
            '@type': 'QuantitativeValue',
            value: listing.floorAreaSqm,
            unitCode: 'MTK',
          },
        }
      : {}),
    petsAllowed: listing.petsConsidered,
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.addressShown,
      addressLocality: listing.area,
      addressRegion: listing.county,
      addressCountry: 'IE',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: listing.latitude,
      longitude: listing.longitude,
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
      availabilityStarts: listing.availableFrom,
      availability: listing.takingEnquiries
        ? 'https://schema.org/InStock'
        : 'https://schema.org/SoldOut',
    },
  };
}

/** An area page's results, in order. */
export function itemListStructuredData(name: string, urls: readonly string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: urls.map((url, i) => ({ '@type': 'ListItem', position: i + 1, url })),
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
