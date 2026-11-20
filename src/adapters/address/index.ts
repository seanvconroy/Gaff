import { env } from '@/lib/env';
import type { AddressSearch } from '@/ports/address-search';
import { sampleAddressSearch } from './sample';

/**
 * No lookup at all: the address step shows its manual fields, and nothing typed leaves Gaff.
 * This is what production runs until Autoaddress is approved and its adapter is written (Q40).
 */
export const noAddressSearch: AddressSearch = {
  name: 'off',
  suggest: async () => [],
  lookUp: async () => null,
};

/** UX-LT-9: the address search in use (ADDRESS_SEARCH). */
export function addressSearch(): AddressSearch {
  return env().ADDRESS_SEARCH === 'sample' ? sampleAddressSearch : noAddressSearch;
}
