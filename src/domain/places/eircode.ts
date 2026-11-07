import { normaliseEircode } from '@/domain/lettings/new-letting';

/**
 * M38, M56: Eircodes and their routing keys. The first three characters of an Eircode are the
 * routing key: "D06 F2X3" is in D06, Dublin 6. Dublin's postal districts are routing keys, so
 * searching "Dublin 6", "D6" or "D06" needs no boundaries.
 */

export { normaliseEircode };

/** Dublin's postal districts and their routing keys. There is no Dublin 19, 21 or 23. */
export const dublinDistricts: ReadonlyArray<{ routingKey: string; name: string }> = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24].map((n) => ({
    routingKey: `D${String(n).padStart(2, '0')}`,
    name: `Dublin ${n}`,
  })),
  { routingKey: 'D6W', name: 'Dublin 6W' },
];

const ROUTING_KEY = /^(?:[AC-FHKNPRTV-Y]\d{2}|D6W)$/;

/** The routing key of a valid Eircode, or null. */
export function routingKeyOf(eircode: string): string | null {
  const normalised = normaliseEircode(eircode);
  return normalised ? normalised.slice(0, 3) : null;
}

/** "Dublin 6", "dublin 6w", "D6", "d06" or "A94" → the routing key; null if it isn't one. */
export function parseRoutingKey(query: string): string | null {
  const q = query.trim().toUpperCase().replace(/\s+/g, ' ');
  const dublin = /^(?:DUBLIN |D ?)(\d{1,2})(W?)$/.exec(q);
  if (dublin) {
    const [, digits, west] = dublin;
    const key = west ? (digits === '6' ? 'D6W' : null) : `D${digits!.padStart(2, '0')}`;
    return key && dublinDistricts.some((d) => d.routingKey === key) ? key : null;
  }
  const compact = q.replace(/\s/g, '');
  return ROUTING_KEY.test(compact) ? compact : null;
}

/** "D06" → "Dublin 6"; other routing keys are shown as themselves. */
export function routingKeyName(routingKey: string): string {
  return dublinDistricts.find((d) => d.routingKey === routingKey)?.name ?? routingKey;
}
