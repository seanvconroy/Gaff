/**
 * UX-LT-9 (Q40): finding a home's full postal address from an Eircode or a few typed words.
 * The vendor is to be Autoaddress, an Irish provider licensed for Eircode data, once its DPA is
 * signed (rule 10; docs/launch-checklist.md). Until then nothing typed leaves Gaff: the adapters
 * are a made-up sample (local work and tests) and "off", where the screen shows the manual
 * address fields and nothing is looked up.
 *
 * Two calls, as address services work: suggestions as the person types, then the full address
 * of the one they pick. What is typed can be a private landlord's own address, so an adapter
 * sends it nowhere but the lookup, and nothing here is logged.
 */
export interface AddressSuggestion {
  /** The adapter's own handle for this address, given back to `lookUp`. */
  id: string;
  /** One line to show in the list: "12 Ranelagh Road, Ranelagh, Dublin 6". */
  label: string;
}

/** A full postal address, in the fields a letting keeps. An address may have no Eircode. */
export interface PostalAddress {
  addressLine1: string;
  addressLine2?: string;
  area: string;
  county: string;
  eircode?: string;
}

export interface AddressSearch {
  /** Which adapter this is. `off`: no lookup, the manual fields are the way in. */
  name: 'off' | 'sample';
  /** Up to eight addresses that match. An empty list when nothing does. */
  suggest(query: string): Promise<AddressSuggestion[]>;
  /** The full address of a suggestion, or null if it is no longer there. */
  lookUp(id: string): Promise<PostalAddress | null>;
}

/** The fewest characters worth looking up. */
export const SHORTEST_ADDRESS_QUERY = 3;
