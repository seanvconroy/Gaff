import { furnishing, propertyTypes } from '@/domain/homes/facts';
import { formatDate, formatDateTime, irishToday } from '@/lib/format';
import { NO_PETS, PETS_CONSIDERED } from '@/copy/search';

/** "2 bedrooms · 1 bathroom · Apartment"; "Studio · 1 bathroom". */
export function roomsLine(home: { bedrooms: number; bathrooms: number; propertyType: string }) {
  const type = propertyTypes[home.propertyType as keyof typeof propertyTypes] ?? 'Home';
  const beds =
    home.propertyType === 'studio' || home.bedrooms === 0
      ? 'Studio'
      : `${home.bedrooms} bedroom${home.bedrooms === 1 ? '' : 's'}`;
  const baths = `${home.bathrooms} bathroom${home.bathrooms === 1 ? '' : 's'}`;
  return home.propertyType === 'studio' ? `${beds} · ${baths}` : `${beds} · ${baths} · ${type}`;
}

/** "Available now" or "Available from Thursday 4 December". */
export function availableWords(availableFrom: string, now = new Date()): string {
  return availableFrom <= irishToday(now)
    ? 'Available now'
    : `Available from ${formatDate(availableFrom, now)}`;
}

export function furnishingWords(value: string): string {
  return furnishing[value as keyof typeof furnishing] ?? value;
}

export function petsWords(considered: boolean): string {
  return considered ? PETS_CONSIDERED : NO_PETS;
}

export function enquiriesCloseWords(closeAt: Date | null, now = new Date()): string | null {
  return closeAt ? `Enquiries close ${formatDateTime(closeAt, now)}` : null;
}
