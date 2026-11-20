import { z } from 'zod';
import type { ProtectedGround } from '@/domain/compliance/protected-grounds';
import { confirmedFindings, type WordingFinding } from './checks';

/**
 * BA-10 (P12, P13; ADR-0017): what the AI's wording check may return, held to a strict shape. The
 * model is trusted for nothing: a finding counts only with a ground from the fixed list and a
 * phrase copied word for word from the description, and it only ever holds the listing for a
 * person on Gaff's team (it never changes or refuses anything on its own).
 */

/** The protected grounds, as the model names them (the same codes as the word list's). */
export const wordingGrounds = [
  'gender',
  'civil_status',
  'family_status',
  'sexual_orientation',
  'religion',
  'age',
  'disability',
  'race',
  'traveller_community',
  'housing_assistance',
] as const satisfies readonly ProtectedGround[];

const readingSchema = z.object({
  findings: z
    .array(
      z.object({
        phrase: z.string().max(200),
        ground: z.enum(wordingGrounds),
      }),
    )
    .max(20),
});

/**
 * P13: the findings to hold the listing for, from what the model said about this text. Null:
 * the reply doesn't fit, so there is no reading, and the listing goes ahead on the word list
 * alone (P5).
 */
export function checkWordingReading(output: unknown, text: string): WordingFinding[] | null {
  const parsed = readingSchema.safeParse(output);
  if (!parsed.success) return null;
  return confirmedFindings(
    parsed.data.findings.map((finding) => ({
      phrase: finding.phrase.trim(),
      ground: finding.ground,
    })),
    text,
  );
}
