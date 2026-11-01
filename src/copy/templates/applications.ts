/**
 * R16: fixed wording inviting someone who came to view to apply. Gaff fills in names and links.
 * For the solicitor, with the other templates.
 */
export const APPLY_INVITATION_TEMPLATE = 'apply_invitation@1';

function hello(renterName: string): string {
  const first = renterName.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

export function applyInvitationEmail(input: {
  renterName: string;
  operatorName: string;
  address: string;
  area: string;
  applyUrl: string;
}) {
  return {
    subject: `Apply for ${input.address}`,
    body: [
      hello(input.renterName),
      '',
      `Thanks for coming to view ${input.address}, ${input.area}. If you’d like to live there, you can apply here. It takes a minute, and you don’t need any documents:`,
      input.applyUrl,
      '',
      `${input.operatorName} will choose who to offer the home to after the viewings, and we’ll email you either way.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}
