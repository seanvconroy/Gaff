/**
 * R22 to R25: fixed wording to the tenant about the agreement, payment and move-in. Gaff fills
 * in names, amounts, dates and links. For the solicitor, with the other templates.
 */
export const AGREEMENT_READY_TEMPLATE = 'agreement_ready@1';
export const AGREEMENT_SIGNED_TEMPLATE = 'agreement_signed@1';

function hello(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

export function agreementReadyEmail(input: {
  tenantName: string;
  operatorName: string;
  address: string;
  area: string;
  agreementUrl: string;
}) {
  return {
    subject: `${input.address}: your tenancy agreement to sign`,
    body: [
      hello(input.tenantName),
      '',
      `Your tenancy agreement for ${input.address}, ${input.area}, is ready. Please read it and sign it here. It takes a few minutes:`,
      input.agreementUrl,
      '',
      `Once you’ve signed, ${input.operatorName} signs too, and you’ll both have a copy. Then ${input.operatorName} will send you how to pay the deposit and first month’s rent.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}

export function agreementSignedEmail(input: {
  tenantName: string;
  operatorName: string;
  address: string;
  agreementUrl: string;
}) {
  return {
    subject: `${input.address}: your tenancy agreement is signed`,
    body: [
      hello(input.tenantName),
      '',
      `Your tenancy agreement for ${input.address} is now signed by you and ${input.operatorName}. You can read and save your copy here:`,
      input.agreementUrl,
      '',
      `Next, ${input.operatorName} will send you how to pay the deposit and first month’s rent.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}
