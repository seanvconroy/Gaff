import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { withOrg } from '@/db/client';
import { organisations } from '@/db/schema';
import type { Member } from '@/server/auth/member';
import { usualAnswer, type UsualQuestion } from '@/domain/tenancy/results';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';

const optionalNumber = (max: number, message: string) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value.replace(',', '.'))))
    .refine((value) => value === null || (Number.isFinite(value) && value > 0 && value <= max), {
      message,
    });

export const usualTimesSchema = z.object({
  hoursPerLetting: optionalNumber(200, 'Enter the hours as a number, like 6 or 6.5.'),
  daysToLet: optionalNumber(365, 'Enter the days as a number, like 30.'),
});

/**
 * R28, Q15: the usual time a letting takes this operator, from their pilot interview. Gaff
 * compares their time in Gaff with it. Only an admin sets it.
 */
export async function setUsualTimes(
  member: Member,
  values: Record<string, string>,
): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can change this.');
  const parsed = usualTimesSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors };
  }
  const minutesPerLetting =
    parsed.data.hoursPerLetting === null ? null : Math.round(parsed.data.hoursPerLetting * 60);
  const daysToLet = parsed.data.daysToLet === null ? null : Math.round(parsed.data.daysToLet);
  await withOrg(member.organisationId, async (tx) => {
    await tx
      .update(organisations)
      .set({ baselineMinutesPerLetting: minutesPerLetting, baselineDaysToLet: daysToLet })
      .where(eq(organisations.id, member.organisationId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'settings.usual_times',
      data: { minutesPerLetting, daysToLet },
    });
  });
  return { ok: true };
}

/**
 * UX-TN-7: "your usual", asked at the first close as two tap questions when a pilot's
 * onboarding didn't set it. One answer at a time; only the offered answers are taken.
 */
export async function answerUsual(
  member: Member,
  question: UsualQuestion,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (member.role !== 'admin') throw new UserFacingError('Only an admin can change this.');
  const answer = usualAnswer(question, value);
  if (answer === null) {
    return {
      ok: false,
      error:
        question === 'days'
          ? 'Choose about how long a letting usually takes you.'
          : 'Choose about how many hours of your time a letting usually takes.',
    };
  }
  await withOrg(member.organisationId, async (tx) => {
    const [now] = await tx
      .select({
        minutesPerLetting: organisations.baselineMinutesPerLetting,
        daysToLet: organisations.baselineDaysToLet,
      })
      .from(organisations)
      .where(eq(organisations.id, member.organisationId));
    const next = {
      minutesPerLetting: question === 'hours' ? answer * 60 : (now?.minutesPerLetting ?? null),
      daysToLet: question === 'days' ? answer : (now?.daysToLet ?? null),
    };
    await tx
      .update(organisations)
      .set({ baselineMinutesPerLetting: next.minutesPerLetting, baselineDaysToLet: next.daysToLet })
      .where(eq(organisations.id, member.organisationId));
    await recordEvent(tx, {
      organisationId: member.organisationId,
      actor: { type: 'person', userId: member.userId },
      type: 'settings.usual_times',
      data: next,
    });
  });
  return { ok: true };
}
