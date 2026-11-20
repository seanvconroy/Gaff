/**
 * UX-LP-5, M52 (BA-14): fixed wording sent to someone whose enquiry, from Daft or MyHome, arrived
 * after the home stopped taking enquiries. They aren't added to the letting, so this is the only
 * message they get, and the address it goes to is cleared on the same schedule as any email Gaff
 * couldn't place. It says it comes from an AI assistant (rule 6), and how to reach a person.
 * For the solicitor's list: its words are pinned by `enquiries-closed.test.ts`.
 */
export const ENQUIRIES_CLOSED_TEMPLATE = 'enquiries_closed@1';

function hello(renterName: string): string {
  const first = renterName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

export function enquiriesClosedReply(input: {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  /** Gaff's own search, where other homes are. */
  searchUrl: string;
}) {
  return {
    subject: `${input.address} is no longer taking enquiries`,
    body: [
      hello(input.renterName),
      '',
      `Thank you for your enquiry about ${input.address}, ${input.area}. ${input.operatorName} has stopped taking new enquiries for this home, so your enquiry hasn’t been added to it.`,
      '',
      `You can see other homes to rent at ${input.searchUrl}`,
      '',
      `This is an automatic reply from Gaff’s AI assistant. To reach a person at ${input.operatorName}, reply to this email.`,
      '',
      'You don’t need to do anything else.',
      '',
      input.operatorName,
    ].join('\n'),
  };
}
