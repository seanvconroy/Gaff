import { organisations } from '@/db/schema';

/**
 * What a private page or an email needs to know about whoever lets the home (UX-PP-1): its name,
 * what kind of lister it is, its PSRA licence where it has one and the agency is confirmed
 * (UX-AG-7: the number comes from its entry in the register), and the local part of its Gaff
 * address, which its privacy notice lives under. Select these wherever an organisation is loaded
 * for a private page or a message, then pass the row to `listerFrom` (`src/domain/frame/frame`).
 *
 * Q43, UX-PP-3: `phone` is the number renters can call, where the lister has given one (at
 * their first go-live, or later). `listerFrom` reads it, "Talk to a person" shows it, and an
 * owner's or a referee's footer gives it.
 */
export const listerColumns = {
  name: organisations.name,
  kind: organisations.kind,
  psraLicenceNumber: organisations.psraLicenceNumber,
  confirmedAt: organisations.confirmedAt,
  inboundSlug: organisations.inboundSlug,
  phone: organisations.phone,
};
