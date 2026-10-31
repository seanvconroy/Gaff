import { z } from 'zod';

export const organisationKinds = ['agency', 'landlord'] as const;
export type OrganisationKind = (typeof organisationKinds)[number];

/** A PSRA licence number as printed on the licence, e.g. 001234. */
const PSRA_LICENCE = /^\d{3,7}$/;

export const newOrganisationSchema = z
  .object({
    yourName: z
      .string()
      .trim()
      .min(2, 'Enter your name')
      .max(80, 'Keep your name under 80 characters'),
    name: z
      .string()
      .trim()
      .min(2, 'Enter the name of your agency or business')
      .max(120, 'Keep the name under 120 characters'),
    kind: z.enum(organisationKinds, {
      error: 'Choose whether you are a letting agency or a landlord',
    }),
    psraLicenceNumber: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ''))
      .optional(),
  })
  .superRefine((value, ctx) => {
    // Gaff is software operated by a licensed agent or by a landlord letting their own
    // homes (PRD Principle 4, PSRA). Agencies must give their licence number.
    if (value.kind !== 'agency') return;
    if (!value.psraLicenceNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['psraLicenceNumber'],
        message:
          'Enter your PSRA licence number. Only licensed agents can let homes for other people.',
      });
    } else if (!PSRA_LICENCE.test(value.psraLicenceNumber)) {
      ctx.addIssue({
        code: 'custom',
        path: ['psraLicenceNumber'],
        message: 'Enter the number as it appears on your PSRA licence, for example 001234',
      });
    }
  })
  .transform((value) => ({
    ...value,
    psraLicenceNumber: value.kind === 'agency' ? value.psraLicenceNumber : undefined,
  }));

export type NewOrganisation = z.output<typeof newOrganisationSchema>;

/** Mailbox names an organisation can't take for its Gaff address (R5). */
const RESERVED = new Set([
  'postmaster',
  'abuse',
  'admin',
  'no-reply',
  'noreply',
  'reply',
  'support',
  'gaff',
]);

/** The local part of an organisation's Gaff address: "Halcyon Lettings" → "halcyon-lettings". */
export function inboundSlugFor(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  if (!slug) return 'operator';
  return RESERVED.has(slug) ? `${slug}-lettings` : slug;
}
