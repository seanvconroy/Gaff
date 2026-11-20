import { letsOwnHomes, type OrganisationKind } from '@/domain/organisations/kinds';

/**
 * UX-NV-7: a private landlord with one home sees the same four destinations, and Lettings opens
 * straight on that home's page, with no list of one. An agency always sees its list.
 */
export function lettingsOpensOn(input: {
  organisationKind: OrganisationKind;
  lettingIds: readonly string[];
}): string | null {
  const [only, ...others] = input.lettingIds;
  if (!letsOwnHomes(input.organisationKind) || !only || others.length > 0) return null;
  return `/lettings/${only}`;
}
