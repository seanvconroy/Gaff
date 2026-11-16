/**
 * Who an organisation is (ADR-0016):
 * - `agency`: a business that lets homes for their owners, under a PSRA licence;
 * - `landlord`: a landlord's team, letting their own homes with help (UX-AG-10);
 * - `private_landlord`: one person letting their own homes, in an organisation of one that is
 *   made silently and has no name of its own (UX-AC-4).
 */
export const organisationKinds = ['agency', 'landlord', 'private_landlord'] as const;
export type OrganisationKind = (typeof organisationKinds)[number];

/** Whether the homes are the organisation's own: there is no owner to ask and no licence. */
export function letsOwnHomes(kind: OrganisationKind): boolean {
  return kind !== 'agency';
}
