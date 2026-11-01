/**
 * R27 (open question Q4): the landlord's read-only page shows the stage, the numbers, every
 * decision, the criteria and the reasons, but never a renter's name, contact details or
 * messages. Renters appear as "Applicant 14", numbered in the order they enquired.
 */
export function applicantLabels(idsInEnquiryOrder: readonly string[]): Map<string, string> {
  return new Map(idsInEnquiryOrder.map((id, index) => [id, `Applicant ${index + 1}`]));
}

/** Everyone who applied came to a viewing; everyone who came was invited and booked. */
const APPLIED = ['applied', 'preferred', 'backup', 'offered', 'accepted', 'declined', 'not_chosen'];
const CAME = ['attended', ...APPLIED];
const BOOKED = ['booked', 'no_show', ...CAME];
const INVITED = ['invited', ...BOOKED];

export function landlordNumbers(people: ReadonlyArray<{ status: string; answered: boolean }>) {
  const count = (statuses: readonly string[]) =>
    people.filter((p) => statuses.includes(p.status)).length;
  return {
    enquiries: people.length,
    answered: people.filter((p) => p.answered).length,
    invited: count(INVITED),
    waitlisted: count(['waitlisted']),
    booked: count(BOOKED),
    came: count(CAME),
    didNotCome: count(['no_show']),
    applied: count(APPLIED),
  };
}
