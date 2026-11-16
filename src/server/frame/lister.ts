import { organisations } from '@/db/schema';

/**
 * What a private page or an email needs to know about whoever lets the home (UX-PP-1): its name,
 * what kind of lister it is, its PSRA licence where it has one and the agency is confirmed
 * (UX-AG-7: the number comes from its entry in the register), and the local part of its Gaff
 * address, which its privacy notice lives under. Select these wherever an organisation is loaded
 * for a private page or a message, then pass the row to `listerFrom` (`src/domain/frame/frame`).
 *
 * THE PHONE NUMBER'S SEAM (Q43, UX-PP-3): organisations have no phone number yet. The package
 * that adds the column adds `phone: organisations.phone` here. The pages that load a whole
 * organisation row need nothing more: `listerFrom` already reads `phone`, "Talk to a person"
 * shows it, and an owner's or a referee's footer gives it.
 */
export const listerColumns = {
  name: organisations.name,
  kind: organisations.kind,
  psraLicenceNumber: organisations.psraLicenceNumber,
  confirmedAt: organisations.confirmedAt,
  inboundSlug: organisations.inboundSlug,
};
