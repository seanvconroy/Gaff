import { normaliseEircode } from '@/domain/lettings/new-letting';
import {
  type AddressSearch,
  type PostalAddress,
  SHORTEST_ADDRESS_QUERY,
} from '@/ports/address-search';

/**
 * A made-up gazetteer, for local work and tests: the stand-in for address search (UX-LT-9).
 * Every address and Eircode here is invented. Production refuses it (src/lib/env.ts).
 */
export const sampleAddresses: ReadonlyArray<PostalAddress & { id: string }> = [
  ['12 Ranelagh Road', 'Ranelagh, Dublin 6', 'Dublin', 'D06 F2X3'],
  ['14 Ranelagh Road', 'Ranelagh, Dublin 6', 'Dublin', 'D06 F2X5'],
  ['Apartment 4, Harbour View', 'Dún Laoghaire', 'Dublin', 'A96 K2N4'],
  ['7 Sandymount Avenue', 'Sandymount, Dublin 4', 'Dublin', 'D04 P6R2'],
  ['3 Rathmore Park', 'Raheny, Dublin 5', 'Dublin', 'D05 X7T1'],
  ['22 Harbour Row', 'Cobh', 'Cork', 'P24 H9W3'],
  ['4 Main Street', 'Navan', 'Meath', 'C15 A2F6'],
  ['9 Shop Street', 'Galway City', 'Galway', 'H91 E4K8'],
  ['31 O’Connell Avenue', 'Limerick City', 'Limerick', 'V94 T3C7'],
  ['2 The Mall', 'Waterford City', 'Waterford', 'X91 N5Y2'],
  ['18 Barrack Street', 'Kilkenny', 'Kilkenny', 'R95 D8P4'],
  ['5 Bridge Street', 'Westport', 'Mayo', 'F28 V6H9'],
  // An address with no Eircode: a new build, say. It is still found, and still accepted.
  ['Rose Cottage, Chapel Lane', 'Kinvara', 'Galway', ''],
].map(([addressLine1, area, county, eircode], index) => ({
  id: `sample-${index + 1}`,
  addressLine1: addressLine1!,
  area: area!,
  county: county!,
  ...(eircode ? { eircode } : {}),
}));

const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const labelOf = (address: PostalAddress) =>
  [address.addressLine1, address.area, address.eircode].filter(Boolean).join(', ');

export const sampleAddressSearch: AddressSearch = {
  name: 'sample',
  async suggest(query) {
    const typed = query.trim();
    if (typed.length < SHORTEST_ADDRESS_QUERY) return [];
    const eircode = normaliseEircode(typed);
    const words = plain(typed).split(' ').filter(Boolean);
    return sampleAddresses
      .filter((address) => {
        if (eircode) return address.eircode === eircode;
        const text = plain(`${labelOf(address)} ${address.county}`);
        return words.every((word) => text.includes(word));
      })
      .slice(0, 8)
      .map((address) => ({ id: address.id, label: labelOf(address) }));
  },
  async lookUp(id) {
    const found = sampleAddresses.find((address) => address.id === id);
    if (!found) return null;
    const { id: _id, ...address } = found;
    return address;
  },
};
