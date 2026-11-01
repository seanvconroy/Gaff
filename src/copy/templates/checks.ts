/**
 * R18: fixed wording about checks, to the chosen renters and to their referees. Gaff fills in
 * names, dates and links. For the solicitor, with the other templates.
 */
export const CHECKS_INVITATION_TEMPLATE = 'checks_invitation@1';
export const REFERENCE_REQUEST_TEMPLATE = 'reference_request@1';
export const REFERENCE_REMINDER_TEMPLATE = 'reference_reminder@1';

function hello(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

export function checksInvitationEmail(input: {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  checksUrl: string;
}) {
  return {
    subject: `${input.address}: a few checks before an offer`,
    body: [
      hello(input.renterName),
      '',
      `Thanks for applying for ${input.address}, ${input.area}. Before making an offer, ${input.operatorName} would like to check three things: your ID, your income and your references.`,
      '',
      'Each check is free, and you start each one yourself, here. We explain each one first:',
      input.checksUrl,
      '',
      `Only ${input.operatorName} sees the results. Once ${input.operatorName} has decided who to offer the home to, we’ll email you either way.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}

function referenceBody(input: {
  refereeName: string;
  renterName: string;
  operatorName: string;
  role: 'landlord' | 'employer';
  referenceUrl: string;
  reminder: boolean;
}) {
  const asked =
    input.role === 'landlord'
      ? 'gave your name as a previous landlord'
      : 'gave your name as their employer';
  return [
    hello(input.refereeName),
    '',
    `${input.reminder ? 'A short reminder: ' : ''}${input.renterName} has applied to rent a home through ${input.operatorName}, and ${asked}. Could you answer a few quick questions? It takes about two minutes, and there’s nothing to sign up for:`,
    input.referenceUrl,
    '',
    `Your answers go only to ${input.operatorName}. They’re deleted once the tenancy starts, or when the letting closes. If you’d rather not give a reference, you can ignore this email.`,
    '',
    `${input.operatorName}, using Gaff`,
  ].join('\n');
}

export function referenceRequestEmail(input: Parameters<typeof referenceBody>[0]) {
  return {
    subject: `Reference for ${input.renterName}`,
    body: referenceBody(input),
  };
}
