import { describe, expect, it } from 'vitest';
import { itemListStructuredData, jsonForScript, listingStructuredData } from './structured-data';

const listing = {
  title: '2 bed apartment in Ranelagh, Dublin 6',
  url: 'https://gaff.ie/home/2-bed-apartment-in-ranelagh-dublin-6-1a2b3c4d',
  description: 'A bright apartment.',
  imageUrls: ['https://cdn.test/1.jpg'],
  propertyType: 'apartment',
  bedrooms: 2,
  bathrooms: 1,
  floorAreaSqm: 68,
  petsConsidered: true,
  addressShown: 'Mount Pleasant Avenue, Ranelagh, Dublin 6',
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  latitude: 53.326,
  longitude: -6.256,
  rentCents: 250_000,
  availableFrom: '2026-12-01',
  takingEnquiries: true,
};

describe('M111: structured data for search engines', () => {
  it('describes a listing as an apartment with a monthly rent', () => {
    const data = listingStructuredData(listing);
    expect(data).toMatchObject({
      '@type': 'Apartment',
      numberOfBedrooms: 2,
      floorSize: { value: 68, unitCode: 'MTK' },
      address: { addressCountry: 'IE', streetAddress: listing.addressShown },
      offers: {
        price: 2500,
        priceCurrency: 'EUR',
        priceSpecification: { unitCode: 'MON' },
        availability: 'https://schema.org/InStock',
      },
    });
  });

  it('marks a home no longer taking enquiries', () => {
    const data = listingStructuredData({ ...listing, takingEnquiries: false });
    expect((data.offers as { availability: string }).availability).toBe(
      'https://schema.org/SoldOut',
    );
  });

  it('lists an area page’s results in order', () => {
    expect(itemListStructuredData('Homes to rent in Ranelagh', ['a', 'b'])).toMatchObject({
      '@type': 'ItemList',
      itemListElement: [
        { position: 1, url: 'a' },
        { position: 2, url: 'b' },
      ],
    });
  });

  it('can’t be broken out of its script tag by a description', () => {
    const json = jsonForScript({ description: '</script><script>alert(1)</script> & more' });
    expect(json).not.toContain('</script>');
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual({ description: '</script><script>alert(1)</script> & more' });
  });
});
