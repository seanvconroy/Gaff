/**
 * UX-AG-9: every letting has one lead, the member responsible for it. Today shows a person what
 * they lead, and an admin's "Everyone" view names each row's lead (UX-HM-11).
 *
 * The seam for work package WP-19 (teams). Until a lead can be changed, the lead is whoever
 * added the letting, so this reads `createdBy`. WP-19 adds the lead to the letting and changes
 * this one function (and the column `dashboardFor` reads) to return it.
 */
export function leadOf(letting: { createdBy: string }): string {
  return letting.createdBy;
}
