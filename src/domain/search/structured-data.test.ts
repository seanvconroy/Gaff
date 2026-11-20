import { describe, expect, it } from 'vitest';
import type { HomeFacts, PublicLister } from '@/domain/homes/home-page';
import { homeStructuredData, jsonForScript } from './structured-data';

const home: HomeFacts = {
  addressLine1: 'Apartment 4, 12 Mount Pleasant Avenue',
  area: 'Ranelagh, Dublin 6',
  county: 'Dublin',
  monthlyRentCents: 250_000,
  availableFrom: '2026-12-01',
  propertyType: 'apartment',
  bedrooms: 2,
  bathrooms: 1,
  furnished: 'furnished',
  parking: 'street',
  berRating: 'C1',
  description: 'A bright apartment near the Luas.\nIdeal for professionals.',
  criteria: { maxOccupants: 3, noPets: true },
  noSmokingIndoors: false,
  facts: [],
};
const agency: PublicLister = { kind: 'agency', name: 'Halcyon Lettings', licence: '001234' };
const landlord: PublicLister = { kind: 'landlord', name: 'Mary', identityVerified: true };
const url = 'https://gaff.ie/homes/3f9a1c2b7d4e';

describe('M111: structured data on a home’s page', () => {
  it('M111: describes an agency’s home as an apartment with a monthly rent, as its page does', () => {
    const data = homeStructuredData({
      url,
      home,
      lister: agency,
      imageUrls: ['https://gaff.ie/p/1.jpg'],
    });
    expect(data).toMatchObject({
      '@type': 'Apartment',
      name: 'Apartment 4, 12 Mount Pleasant Avenue, Ranelagh, Dublin 6',
      url,
      image: ['https://gaff.ie/p/1.jpg'],
      numberOfBedrooms: 2,
      numberOfBathroomsTotal: 1,
      petsAllowed: false,
      address: {
        streetAddress: 'Apartment 4, 12 Mount Pleasant Avenue',
        addressLocality: 'Ranelagh, Dublin 6',
        addressCountry: 'IE',
      },
      offers: {
        price: 2500,
        priceCurrency: 'EUR',
        priceSpecification: { unitCode: 'MON' },
        availabilityStarts: '2026-12-01',
        availability: 'https://schema.org/InStock',
      },
    });
  });

  it('M111, M38: a landlord’s home gives its street, never its door number or a point', () => {
    const data = homeStructuredData({ url, home, lister: landlord, imageUrls: [] });
    const json = JSON.stringify(data);
    expect(data).toMatchObject({
      name: 'Mount Pleasant Avenue, Ranelagh, Dublin 6',
      address: { streetAddress: 'Mount Pleasant Avenue' },
    });
    expect(json).not.toMatch(/12 Mount|Apartment 4/);
    expect(json).not.toMatch(/geo|latitude|longitude/i);
  });

  it('M111, rule 3: holds no person, no Eircode, and none of the words the page leaves out', () => {
    const json = JSON.stringify(homeStructuredData({ url, home, lister: agency, imageUrls: [] }));
    expect(json).toContain('A bright apartment near the Luas.');
    // The wording check leaves "who it suits" out of the page, so it's out of here too.
    expect(json).not.toContain('professionals');
    expect(json).not.toContain('Halcyon');
    expect(json).not.toContain('001234');
    expect(json).not.toMatch(/postalCode|eircode/i);
  });

  it('M111: says nothing about pets where the lister set no terms', () => {
    const data = homeStructuredData({
      url,
      home: { ...home, criteria: null },
      lister: agency,
      imageUrls: [],
    });
    expect(data).not.toHaveProperty('petsAllowed');
    expect(
      homeStructuredData({
        url,
        home: { ...home, propertyType: 'house' },
        lister: agency,
        imageUrls: [],
      }),
    ).toMatchObject({ '@type': 'House' });
  });

  it('M111: can’t be broken out of its script tag by a description', () => {
    const json = jsonForScript({ description: '</script><script>alert(1)</script> & more' });
    expect(json).not.toContain('</script>');
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual({ description: '</script><script>alert(1)</script> & more' });
  });
});
