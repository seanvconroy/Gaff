import { formatDate, formatEuro } from '@/lib/format';

/**
 * R22: Gaff's standard residential tenancy agreement.
 *
 * DRAFT WORDING FOR SOLICITOR REVIEW BEFORE FIRST USE (docs/launch-checklist.md). It states the
 * agreed facts and points to the Residential Tenancies Acts for rights and obligations, rather
 * than restating the law. It contains no fee, charge or condition beyond the deposit and rent
 * (rule 4), and nothing touching a protected ground (rule 3; checked by a compliance test).
 */
export const AGREEMENT_TEMPLATE = 'gaff_standard_agreement@1';

export interface AgreementFacts {
  landlordName: string;
  agentName: string | null;
  psraLicenceNumber: string | null;
  tenantName: string;
  address: string;
  area: string;
  description: string;
  startDate: string;
  rentCents: number;
  rentDueDay: number;
  depositCents: number;
}

export interface AgreementDocument {
  template: string;
  title: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

function ordinal(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  return `${day}${suffix}`;
}

export function tenancyAgreement(facts: AgreementFacts): AgreementDocument {
  const landlord = facts.agentName
    ? `${facts.landlordName} (the landlord), acting through their letting agent ${facts.agentName}${facts.psraLicenceNumber ? `, PSRA licence ${facts.psraLicenceNumber}` : ''}`
    : `${facts.landlordName} (the landlord)`;
  return {
    template: AGREEMENT_TEMPLATE,
    title: `Tenancy agreement: ${facts.address}`,
    sections: [
      {
        heading: '1. Who this agreement is between',
        paragraphs: [`${landlord}, and ${facts.tenantName} (the tenant).`],
      },
      {
        heading: '2. The home',
        paragraphs: [`${facts.address}, ${facts.area}: ${facts.description}.`],
      },
      {
        heading: '3. When the tenancy starts',
        paragraphs: [
          `The tenancy starts on ${formatDate(facts.startDate)}. It is a tenancy under the Residential Tenancies Acts, which set out how long it lasts and how it can end.`,
        ],
      },
      {
        heading: '4. Rent',
        paragraphs: [
          `The rent is ${formatEuro(facts.rentCents)} a month, paid in advance on the ${ordinal(facts.rentDueDay)} day of each month, into the bank account the landlord or their agent gives the tenant in writing.`,
          'The rent can only be changed as the Residential Tenancies Acts allow.',
        ],
      },
      {
        heading: '5. Deposit',
        paragraphs: [
          `The deposit is ${formatEuro(facts.depositCents)}, which is no more than one month’s rent. It is returned promptly when the tenancy ends, less only any rent owed or the cost of damage beyond normal wear and tear.`,
          'Apart from the deposit and the first month’s rent, nothing else is paid to get or keep this tenancy.',
        ],
      },
      {
        heading: '6. What the landlord does',
        paragraphs: [
          'The landlord meets their obligations under the Residential Tenancies Acts, including section 12 of the Residential Tenancies Act 2004, and registers the tenancy with the Residential Tenancies Board.',
        ],
      },
      {
        heading: '7. What the tenant does',
        paragraphs: [
          'The tenant meets their obligations under the Residential Tenancies Acts, including section 16 of the Residential Tenancies Act 2004.',
        ],
      },
      {
        heading: '8. Ending the tenancy',
        paragraphs: [
          'Either side can end the tenancy only as the Residential Tenancies Acts allow, giving the notice they require.',
        ],
      },
      {
        heading: '9. Disagreements',
        paragraphs: [
          'If there is a disagreement the landlord and tenant can’t settle between them, either can refer it to the Residential Tenancies Board.',
        ],
      },
    ],
  };
}
