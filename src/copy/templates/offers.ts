import { formatDate } from '@/lib/format';

/**
 * R19, R20, R21: fixed wording for the landlord's approval, the offer and the outcomes. Gaff
 * fills in names, amounts, dates and links. For the solicitor, with the other templates.
 */
export const LANDLORD_APPROVAL_TEMPLATE = 'landlord_approval@1';

function hello(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

export function landlordApprovalEmail(input: {
  landlordName: string;
  operatorName: string;
  address: string;
  area: string;
  withBackup: boolean;
  approvalUrl: string;
  availableFrom: string;
}) {
  return {
    subject: `${input.address}: please approve a tenant`,
    body: [
      hello(input.landlordName),
      '',
      `${input.operatorName} has chosen a preferred tenant for ${input.address}, ${input.area}${input.withBackup ? ', and a backup' : ''}. You can see a one-page summary, and approve or decline, here. There’s nothing to sign up for:`,
      input.approvalUrl,
      '',
      `Once you’ve approved, ${input.operatorName} makes the offer, for the home to be available from ${formatDate(input.availableFrom)}.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}
