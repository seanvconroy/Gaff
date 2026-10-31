import { formatDate } from '@/lib/format';

/**
 * R26 (basic): fixed wording sent to everyone who enquired when a person closes the letting,
 * so everyone hears back, and knows when their details will be deleted. For the solicitor.
 */
export const LETTING_CLOSED_TEMPLATE = 'letting_closed@1';

function hello(renterName: string): string {
  const first = renterName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

export function lettingClosedEmail(input: {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  outcome: 'let' | 'withdrawn';
  deleteOn: string;
}) {
  return {
    subject:
      input.outcome === 'let'
        ? `${input.address} has been let`
        : `${input.address} is no longer available`,
    body: [
      hello(input.renterName),
      '',
      input.outcome === 'let'
        ? `${input.address}, ${input.area}, has now been let, so ${input.operatorName} has closed enquiries for it. If you’ve agreed to rent it, ${input.operatorName} will be in touch with you directly.`
        : `${input.operatorName} has decided not to let ${input.address}, ${input.area}, for now, so enquiries for it are closed.`,
      '',
      `Thank you for your interest. We’ll delete your details from Gaff by ${formatDate(input.deleteOn)}.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}
