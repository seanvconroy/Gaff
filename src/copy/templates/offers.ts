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

export const OFFER_TEMPLATE = 'offer@1';
export const OFFER_EXPIRED_TEMPLATE = 'offer_expired@1';
export const OUTCOME_TEMPLATE = 'outcome@1';

/** R20: the offer. It names the only payments there are, both capped, paid to the operator. */
export function offerEmail(input: {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  rent: string;
  deposit: string;
  startDate: string;
  deadline: string;
  offerUrl: string;
}) {
  return {
    subject: `An offer: ${input.address}`,
    body: [
      hello(input.renterName),
      '',
      `Good news: ${input.operatorName} would like to offer you ${input.address}, ${input.area}.`,
      '',
      `The rent is ${input.rent} a month, from ${input.startDate}. To secure the home, you’d pay a deposit of ${input.deposit} and the first month’s rent of ${input.rent}, directly to ${input.operatorName}. There are no other fees, and nothing is paid through Gaff.`,
      '',
      `Please accept or decline by ${input.deadline}, here:`,
      input.offerUrl,
      '',
      `If you accept, ${input.operatorName} will send you the tenancy agreement to sign, and how to pay. If we don’t hear from you by then, the offer closes.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}

/** R20: an offer that wasn't answered in time. */
export function offerExpiredEmail(input: {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  deadline: string;
  deleteOn: string;
}) {
  return {
    subject: `${input.address}: the offer has closed`,
    body: [
      hello(input.renterName),
      '',
      `The offer for ${input.address}, ${input.area}, wasn’t accepted by ${input.deadline}, so it has now closed. Thank you for your interest in the home.`,
      '',
      `We’ll delete your details from Gaff by ${formatDate(input.deleteOn)}.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}

/** R21: everyone else hears, promptly and politely, once the home is let. */
export function outcomeEmail(input: {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  applied: boolean;
  deleteOn: string;
}) {
  return {
    subject: input.applied
      ? `${input.address}: an update on your application`
      : `${input.address} has been let`,
    body: [
      hello(input.renterName),
      '',
      input.applied
        ? `Thank you for applying for ${input.address}, ${input.area}. ${input.operatorName} has now let the home to another applicant.`
        : `Thanks for your interest in ${input.address}, ${input.area}. The home has now been let, so ${input.operatorName} has closed enquiries for it.`,
      '',
      `We wish you well with your search. We’ll delete your details from Gaff by ${formatDate(input.deleteOn)}.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}
