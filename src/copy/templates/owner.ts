/**
 * UX-OW-1, R27: fixed wording for the email that gives a home's owner their private link, sent
 * when the agent shares the letting with them. Gaff fills in the names, the address and the
 * link. Nothing in it invites the owner to use Gaff (Q45).
 *
 * NEW WORDING (work package WP-13), for the solicitor with the other templates. Until it's
 * agreed it is pinned by its own test (`owner.test.ts`, beside it), not yet by the
 * fingerprint of every fixed message (tests/compliance/template-words.test.ts).
 */
export const OWNER_LINK_TEMPLATE = 'owner_link@1';

function hello(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /^[\p{L}'’-]{2,}$/u.test(first) ? `Hello ${first},` : 'Hello,';
}

export function ownerLinkEmail(input: {
  ownerName: string;
  operatorName: string;
  address: string;
  area: string;
  followUrl: string;
}) {
  return {
    subject: `${input.address}: follow the letting`,
    body: [
      hello(input.ownerName),
      '',
      `${input.operatorName} is letting ${input.address}, ${input.area}, for you. You can see how it’s going at any time, here. There’s nothing to sign up for:`,
      input.followUrl,
      '',
      `The page shows where the letting stands and what has been decided. When ${input.operatorName} has chosen a tenant, you’ll get an email asking you to approve.`,
      '',
      input.operatorName,
    ].join('\n'),
  };
}
