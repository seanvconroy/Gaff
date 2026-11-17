/**
 * UX-AG-9: every letting has one lead, the member responsible for it. Today shows a person what
 * they lead, and an admin's "Everyone" view names each row's lead (UX-HM-11).
 *
 * The lead is stored on the letting (`lettings.lead_user_id`). It is whoever added the letting
 * until someone changes it (`changeLead` in src/server/team/lead.ts), and when a member leaves or
 * is removed, each letting they led is handed to someone who stays (UX-AG-15).
 */
export function leadOf(letting: { leadUserId: string }): string {
  return letting.leadUserId;
}
