import { newLettingSchema, type NewLetting } from '@/domain/lettings/new-letting';
import { viewingSessionSchema, type ViewingSession } from '@/domain/viewings/viewing-session';
import { irishToday } from '@/lib/format';

/** Synthetic lettings for tests. Never real addresses or people. */
export function aLetting(overrides: Partial<Record<string, string>> = {}): NewLetting {
  return newLettingSchema().parse({
    addressLine1: '12 Ranelagh Road',
    addressLine2: '',
    area: 'Ranelagh, Dublin 6',
    county: 'Dublin',
    eircode: 'D06 F2X3',
    rent: '1,850',
    availableFrom: daysFromToday(30),
    propertyType: 'apartment',
    bedrooms: '2',
    bathrooms: '1',
    furnished: 'furnished',
    berRating: 'C1',
    parking: 'street',
    photosUrl: 'https://photos.example.ie/12-ranelagh',
    daftUrl: 'https://www.daft.ie/for-rent/apartment-12-ranelagh-road/123456',
    myhomeUrl: '',
    landlordName: 'Mary Byrne',
    landlordEmail: 'mary.byrne@example.ie',
    otherFacts: 'Gas central heating\nBins collected on Tuesdays',
    ...overrides,
  });
}

export function aViewingSession(overrides: Partial<Record<string, string>> = {}): ViewingSession {
  return viewingSessionSchema().parse({
    date: daysFromToday(7),
    start: '18:00',
    end: '19:00',
    kind: 'slots',
    slotMinutes: '15',
    ...overrides,
  });
}

export function daysFromToday(days: number): string {
  return irishToday(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}
