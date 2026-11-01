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

export const PAYMENT_REQUEST_TEMPLATE = 'payment_request@1';
export const PAYMENT_RECEIVED_TEMPLATE = 'payment_received@1';

/**
 * R23: what to pay and by when. The bank details are on the tenant's private page, never in the
 * email, and they're asked to confirm them by phone first: payment-diversion scams copy emails.
 */
export function paymentRequestEmail(input: {
  tenantName: string;
  operatorName: string;
  address: string;
  deposit: string;
  firstRent: string;
  total: string;
  dueDate: string;
  pageUrl: string;
}) {
  return {
    subject: `${input.address}: paying the deposit and first month’s rent`,
    body: [
      hello(input.tenantName),
      '',
      `To secure ${input.address}, please pay ${input.total} by ${input.dueDate}: the deposit of ${input.deposit} and the first month’s rent of ${input.firstRent}. There are no other fees.`,
      '',
      `You pay directly to ${input.operatorName}, not to Gaff. To keep the bank details safe, they’re on your page, not in this email:`,
      input.pageUrl,
      '',
      `Before you pay, please check the bank details with ${input.operatorName} by phone. We’ll never send you different details by email.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}

export function paymentReceivedEmail(input: {
  tenantName: string;
  operatorName: string;
  address: string;
  total: string;
  startDate: string;
}) {
  return {
    subject: `${input.address}: payment received`,
    body: [
      hello(input.tenantName),
      '',
      `${input.operatorName} has received your payment of ${input.total} for ${input.address}. Thank you.`,
      '',
      `Your tenancy starts on ${input.startDate}. ${input.operatorName} will be in touch about moving in and the keys.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}
