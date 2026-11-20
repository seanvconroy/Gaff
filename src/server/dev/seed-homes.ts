import type { Criteria } from '@/domain/criteria/criteria';
import type { Point } from '@/domain/places/geo';
import type { Framing, SeedPhoto } from './seed-photos';

/**
 * BA-4: the test copy's made-up listers and their homes. Every person, address and email here
 * is invented: the emails are at made-up addresses (example.ie, .test), so their mail stays in
 * the outbox. The areas are real, so search and the map find the homes where they'd be.
 *
 * Nothing here touches a protected ground (rule 3): the criteria are from the fixed list, and
 * every description and fact passes the same wording check a lister's does.
 */

export interface SeedHome {
  /** What `newLettingSchema` reads, as a form would send it. */
  letting: Record<string, string>;
  description: string;
  /** From the fixed list only (rule 3). */
  criteria: Criteria;
  noSmokingIndoors: boolean;
  /** Its photos (data/seed-photos), the cover first. */
  photos: SeedPhoto[];
  /**
   * M38, M125: the home's pin, on a street in its area. The addresses are made up, so no pin
   * is anyone's real home.
   */
  point: Point;
}

export interface SeedLister {
  kind: 'agency' | 'private_landlord';
  person: { name: string; email: string };
  /** An agency's licence, as the made-up sample register lists it (UX-AG-1). */
  licenceNumber?: string;
  /** Each lister's photos are framed their own way, so none looks taken from another's (M29). */
  framing: Framing;
  homes: SeedHome[];
}

/** The landlord an agency lets for, as the agency adds them. */
const landlord = { landlordName: 'Brendan Hayes', landlordEmail: 'brendan.hayes@example.ie' };

export const seedListers: SeedLister[] = [
  {
    kind: 'agency',
    // Liffey Quay Estates Limited, trading as Liffey Quay, Dublin, in the sample register.
    licenceNumber: '001239',
    person: { name: 'Ann Power', email: 'ann@liffey-quay.test' },
    framing: 'full',
    homes: [
      {
        letting: {
          addressLine1: 'Apartment 4, 7 Beechfield Terrace',
          area: 'Ranelagh, Dublin 6',
          county: 'Dublin',
          eircode: 'D06 K2T4',
          rent: '2,250',
          propertyType: 'apartment',
          bedrooms: '2',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'B2',
          parking: 'street',
          otherFacts: [
            'Gas central heating',
            'Bins are collected on Tuesdays',
            'The Luas stop at Ranelagh is a 5-minute walk',
            'Permit parking on the street, one permit for the apartment',
            'Second floor, with a lift',
            'A south-facing balcony off the living room',
            'Floor area of 72 square metres',
            'Washing machine, dishwasher, fridge freezer, oven and microwave',
            'Fibre broadband is connected',
          ].join('\n'),
          ...landlord,
        },
        description:
          'A bright two-bedroom apartment on the second floor of a quiet red-brick terrace, five minutes’ walk from Ranelagh village and the Luas. The living room opens onto a south-facing balcony. The kitchen is fully fitted, with a dishwasher and washing machine. Both bedrooms are doubles with built-in wardrobes. Fibre broadband is connected.',
        criteria: { maxOccupants: 3, noPets: true, minStayMonths: 12 },
        noSmokingIndoors: true,
        photos: [
          'living-room-and-kitchen',
          'bed-by-the-window',
          'living-room-tall-windows',
          'outside',
        ],
        point: { lat: 53.32578, lng: -6.25423 },
      },
      {
        letting: {
          addressLine1: 'Flat 2, 31 Orchard Row',
          area: 'Rathmines, Dublin 6',
          county: 'Dublin',
          eircode: 'D06 P8W3',
          rent: '1,750',
          propertyType: 'apartment',
          bedrooms: '1',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'C1',
          parking: 'none',
          otherFacts: [
            'Electric storage heating',
            'Bins are collected on Mondays',
            'Bike storage in the back garden',
            'First floor, no lift',
            'A shared back garden',
            'Floor area of 45 square metres',
            'Washing machine, fridge freezer and oven',
            'Fibre broadband is connected',
          ].join('\n'),
          ...landlord,
        },
        description:
          'A one-bedroom flat on the first floor of a period house just off Rathmines Road. High ceilings and tall sash windows make it light all day. There is a separate kitchen, a shower room and a shared back garden with secure bike storage. Shops, cafés and buses into town are at the end of the road.',
        criteria: { maxOccupants: 2, noPets: true },
        noSmokingIndoors: true,
        photos: ['bed-by-the-window', 'living-room-and-kitchen', 'outside'],
        point: { lat: 53.32296, lng: -6.2682 },
      },
      {
        letting: {
          addressLine1: '19 Millbrook Avenue',
          area: 'Drumcondra, Dublin 9',
          county: 'Dublin',
          eircode: 'D09 X4N7',
          rent: '2,950',
          propertyType: 'house',
          bedrooms: '3',
          bathrooms: '2',
          furnished: 'part_furnished',
          berRating: 'C2',
          parking: 'space',
          otherFacts: [
            'Gas central heating',
            'Bins are collected on Thursdays',
            'Off-street parking for one car',
            'The back garden faces west',
            'Floor area of 105 square metres',
            'Washing machine, dryer, dishwasher, fridge freezer and oven',
            'Fibre broadband is connected',
          ].join('\n'),
          ...landlord,
        },
        description:
          'A three-bedroom semi-detached house on a leafy avenue near Drumcondra village. Downstairs there is a living room with a stove, a kitchen-dining room and a toilet. Upstairs are two double bedrooms, a single and a bathroom. The back garden faces west and there is parking for one car in the drive.',
        criteria: { maxOccupants: 5, noPets: false, minStayMonths: 12 },
        noSmokingIndoors: false,
        photos: ['living-room-tall-windows', 'living-room-and-kitchen', 'bed-by-the-window'],
        point: { lat: 53.36978, lng: -6.2593 },
      },
      {
        letting: {
          addressLine1: 'Studio 5, 12 Canal View',
          area: 'Portobello, Dublin 8',
          county: 'Dublin',
          eircode: 'D08 R6K2',
          rent: '1,450',
          propertyType: 'studio',
          bedrooms: '0',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'B3',
          parking: 'none',
          otherFacts: [
            'Electric heating',
            'Bins are collected on Wednesdays',
            'The canal is across the road',
            'Third floor, with a lift',
            'Floor area of 32 square metres',
            'Washing machine, fridge freezer, microwave and oven',
            'Fibre broadband is connected',
          ].join('\n'),
          ...landlord,
        },
        description:
          'A compact studio on the third floor of a modern block beside the Grand Canal at Portobello. One open room with a kitchen along one wall, a sofa bed area and a shower room. There is a lift, and the windows look out over the water. The city centre is a fifteen-minute walk away.',
        criteria: { maxOccupants: 1, noPets: true },
        noSmokingIndoors: true,
        photos: ['studio', 'bed-by-the-window', 'outside'],
        point: { lat: 53.32977, lng: -6.26608 },
      },
    ],
  },
  {
    kind: 'agency',
    // Corrib Homes Limited, Galway, in the sample register.
    licenceNumber: '001236',
    person: { name: 'Cian Moran', email: 'cian@corrib-homes.test' },
    framing: 'left',
    homes: [
      {
        letting: {
          addressLine1: '8 Seapoint Grove',
          area: 'Salthill, Galway city',
          county: 'Galway',
          eircode: 'H91 T2C8',
          rent: '1,950',
          propertyType: 'house',
          bedrooms: '2',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'C1',
          parking: 'space',
          otherFacts: [
            'Gas central heating',
            'Bins are collected on Fridays',
            'The promenade is a 3-minute walk',
            'A paved yard at the back',
            'Floor area of 78 square metres',
            'Washing machine, dryer, fridge freezer and oven',
          ].join('\n'),
          ...landlord,
        },
        description:
          'A two-bedroom terraced house a short walk from the promenade in Salthill. The front room has a bay window, and the kitchen opens onto a sunny paved yard at the back. Upstairs are a double, a single and a bathroom with an electric shower. There is a parking space in front of the house.',
        criteria: { maxOccupants: 3, noPets: false },
        noSmokingIndoors: false,
        photos: ['living-room-tall-windows', 'bed-by-the-window', 'living-room-and-kitchen'],
        point: { lat: 53.26435, lng: -9.07494 },
      },
      {
        letting: {
          addressLine1: 'Apartment 12, The Weir',
          area: 'Galway city',
          county: 'Galway',
          eircode: 'H91 W5D3',
          rent: '1,400',
          propertyType: 'apartment',
          bedrooms: '1',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'B1',
          parking: 'none',
          otherFacts: [
            'Heating by heat pump',
            'Bins are in the basement and collected weekly',
            'No parking, but there is a bike room',
            'Fourth floor, with a lift',
            'A balcony over the river',
            'Floor area of 50 square metres',
            'Washing machine, dishwasher, fridge freezer, oven and microwave',
            'Fibre broadband is connected',
          ].join('\n'),
          ...landlord,
        },
        description:
          'A one-bedroom apartment on the fourth floor, overlooking the river in the city centre. It has an open-plan living room and kitchen, a double bedroom and a bathroom with a bath. The balcony catches the evening sun. Heating is by heat pump, and the building has a lift and a bike room.',
        criteria: { maxOccupants: 2, noPets: true },
        noSmokingIndoors: true,
        photos: ['living-room-and-kitchen', 'bed-by-the-window', 'outside'],
        point: { lat: 53.272, lng: -9.0583 },
      },
      {
        letting: {
          addressLine1: '23 Ardmore Park',
          area: 'Knocknacarra, Galway city',
          county: 'Galway',
          eircode: 'H91 F7X2',
          rent: '2,600',
          propertyType: 'house',
          bedrooms: '4',
          bathrooms: '3',
          furnished: 'unfurnished',
          berRating: 'B2',
          parking: 'space',
          otherFacts: [
            'Heating by heat pump',
            'Bins are collected on Tuesdays',
            'Parking for two cars',
            'The nearest bus stop is on the main road, a 4-minute walk',
            'A large back garden',
            'Floor area of 140 square metres',
            'Washing machine, dryer, dishwasher, fridge freezer and oven',
            'Fibre broadband is connected',
          ].join('\n'),
          ...landlord,
        },
        description:
          'A four-bedroom detached house in a quiet estate in Knocknacarra, with a large back garden. Downstairs there is a living room, a study, a kitchen-dining room and a utility room. Upstairs, the main bedroom has an en-suite, and there are three more bedrooms and a bathroom. Parking for two cars.',
        criteria: { maxOccupants: 6, noPets: false, minStayMonths: 12 },
        noSmokingIndoors: false,
        photos: ['bed-by-the-window', 'living-room-tall-windows', 'living-room-and-kitchen'],
        point: { lat: 53.26999, lng: -9.10764 },
      },
    ],
  },
  {
    kind: 'private_landlord',
    person: { name: 'Siobhán Daly', email: 'siobhan.daly@example.ie' },
    framing: 'right',
    homes: [
      {
        letting: {
          addressLine1: '6 Lough View',
          area: 'Ballintemple, Cork city',
          county: 'Cork',
          eircode: 'T12 E4H6',
          rent: '1,800',
          propertyType: 'house',
          bedrooms: '2',
          bathrooms: '1',
          furnished: 'furnished',
          berRating: 'D1',
          parking: 'street',
          otherFacts: [
            'Gas central heating',
            'Bins are collected on Wednesdays',
            'The Lough is at the end of the road',
            'A small private back garden',
            'Floor area of 70 square metres',
            'Washing machine, fridge freezer and oven',
          ].join('\n'),
        },
        description:
          'My two-bedroom end-of-terrace house near the Lough in Ballintemple. It has a cosy front room with an open fire, a kitchen with space to eat, a double bedroom, a single bedroom and a bathroom upstairs. The back garden is small and private. Buses to the city centre stop at the corner.',
        criteria: { maxOccupants: 3, noPets: true },
        noSmokingIndoors: true,
        photos: ['living-room-tall-windows', 'bed-by-the-window', 'living-room-and-kitchen'],
        point: { lat: 51.8944, lng: -8.43866 },
      },
      {
        letting: {
          addressLine1: 'Apartment 3, 15 Quay Street',
          area: 'Cork city',
          county: 'Cork',
          eircode: 'T12 Y9P5',
          rent: '1,350',
          propertyType: 'apartment',
          bedrooms: '1',
          bathrooms: '1',
          furnished: 'part_furnished',
          berRating: 'C3',
          parking: 'none',
          otherFacts: [
            'Electric heating',
            'Bins are collected on Mondays',
            'The apartment is above a bookshop',
            'First floor, no lift',
            'Floor area of 42 square metres',
            'Washing machine, fridge freezer, oven and microwave',
            'Fibre broadband is connected',
          ].join('\n'),
        },
        description:
          'A one-bedroom apartment on the first floor of an old building on the quays, above a bookshop. The living room has two big windows onto the river. There is a galley kitchen, a double bedroom and a shower room. It comes with a bed, a sofa and a table; you bring the rest.',
        criteria: { maxOccupants: 2, noPets: true },
        noSmokingIndoors: true,
        photos: ['outside', 'living-room-and-kitchen', 'bed-by-the-window'],
        point: { lat: 51.8971, lng: -8.47488 },
      },
    ],
  },
];
