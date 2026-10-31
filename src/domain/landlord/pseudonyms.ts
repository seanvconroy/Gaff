/**
 * R27 (open question Q4): the landlord's read-only page shows the stage, the numbers, every
 * decision, the criteria and the reasons, but never a renter's name, contact details or
 * messages. Renters appear as "Applicant 14", numbered in the order they enquired.
 */
export function applicantLabels(idsInEnquiryOrder: readonly string[]): Map<string, string> {
  return new Map(idsInEnquiryOrder.map((id, index) => [id, `Applicant ${index + 1}`]));
}

const INVITED = ['invited', 'booked', 'attended', 'no_show'];

export function landlordNumbers(people: ReadonlyArray<{ status: string; answered: boolean }>) {
  const count = (statuses: readonly string[]) =>
    people.filter((p) => statuses.includes(p.status)).length;
  return {
    enquiries: people.length,
    answered: people.filter((p) => p.answered).length,
    invited: count(INVITED),
    waitlisted: count(['waitlisted']),
    booked: count(['booked', 'attended', 'no_show']),
    came: count(['attended']),
    didNotCome: count(['no_show']),
  };
}
