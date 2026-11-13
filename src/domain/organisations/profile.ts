import { z } from 'zod';
import { protectedGroundProblem } from '@/domain/compliance/protected-grounds';

/** M17, M18: the public profiles of an agency and of the people who let homes. */

const trimmed = z.string().trim();
/** A form field that may be left blank: blank becomes undefined, anything else must pass. */
const optional = <T extends z.ZodType>(schema: T) =>
  z
    .preprocess((v) => (v === undefined || v === null ? '' : String(v).trim()), z.string())
    .transform((v, ctx): z.output<T> | undefined => {
      if (v === '') return undefined;
      const parsed = schema.safeParse(v);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ code: 'custom', message: issue.message });
        }
        return z.NEVER;
      }
      return parsed.data;
    });

const phone = trimmed.regex(/^\+?[\d ()-]{7,20}$/, 'Enter a phone number, like 01 234 5678');

const publicText = (max: number) =>
  trimmed.max(max, `Keep it under ${max} characters`).superRefine((value, ctx) => {
    const problem = protectedGroundProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
    if (/https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]/i.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Put your website and contact details in their own boxes, not here',
      });
    }
  });

export const agencyProfileSchema = z.object({
  legalName: trimmed
    .min(2, 'Enter the name on your PSRA licence')
    .max(160, 'Keep the name under 160 characters'),
  officeAddress: optional(trimmed.max(200, 'Keep the address under 200 characters')),
  publicPhone: optional(phone),
  website: optional(
    trimmed.url('Enter your website, starting https://').refine((v) => v.startsWith('https://'), {
      message: 'Enter your website, starting https://',
    }),
  ),
  about: optional(publicText(800)),
});
export type AgencyProfile = z.output<typeof agencyProfileSchema>;

export const memberProfileSchema = z
  .object({
    displayName: trimmed
      .min(2, 'Enter your name as renters should see it')
      .max(80, 'Keep your name under 80 characters'),
    psraLicenceNumber: optional(
      trimmed
        .transform((v) => v.replace(/\s+/g, ''))
        .pipe(z.string().regex(/^\d{3,12}$/, 'Enter the number on your PSRA licence, like 001234')),
    ),
    showPhone: z.enum(['yes', 'no']).transform((v) => v === 'yes'),
    publicPhone: optional(phone),
  })
  .superRefine((value, ctx) => {
    if (value.showPhone && !value.publicPhone) {
      ctx.addIssue({
        code: 'custom',
        path: ['publicPhone'],
        message: 'Enter the number to show, or choose not to show one',
      });
    }
  });
export type MemberProfile = z.output<typeof memberProfileSchema>;
