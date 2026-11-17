import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { peopleQuestionReader } from '@/adapters/ai';
import { withOrg } from '@/db/client';
import { applications } from '@/db/schema';
import {
  checkQuestionReading,
  MAX_QUESTION,
  type PeopleFilter,
  readPeopleQuestion,
} from '@/domain/fit/ask';
import { stripPersonalDetails } from '@/domain/lettings/advert-reading';
import { irishToday } from '@/lib/format';
import type { PeopleQuestionReader } from '@/ports/ai';
import type { Member } from '@/server/auth/member';

const questionSchema = z
  .string()
  .trim()
  .max(MAX_QUESTION * 4);

/**
 * UX-LP-15, UX-MT-18, UX-AI-6, UX-AI-7: "Ask about who's enquired". The question becomes a filter
 * on the four answers and the time of enquiry, or nothing (the fixed decline). Plain code reads
 * it first, so it works with the model off; only a question plain code couldn't read, and that
 * has already passed the checks for anything about who a person is, goes to the model, with
 * names and contact details taken out.
 *
 * It stores nothing of the question: no row, no event, no log, and the question never goes into
 * an address. It changes nothing: a filter is only how the list is looked at (rule 1).
 */
export async function askAboutPeople(
  member: Member,
  lettingId: string,
  question: unknown,
  reader: PeopleQuestionReader = peopleQuestionReader(),
  now: Date = new Date(),
): Promise<PeopleFilter | null> {
  const parsed = questionSchema.safeParse(question);
  if (!parsed.success || !parsed.data) return null;
  const today = irishToday(now);
  const reading = readPeopleQuestion(parsed.data, today);
  if (reading.kind === 'filter') return reading.filter;
  if (reading.why === 'not_allowed') return null;

  // UX-AI-8: the model never sees a name: everyone on this letting, the member and their agency.
  const names = await withOrg(member.organisationId, async (tx) =>
    (
      await tx
        .select({ name: applications.fullName })
        .from(applications)
        .where(eq(applications.lettingId, lettingId))
    ).map((row) => row.name),
  );
  const text = stripPersonalDetails(parsed.data, [...names, member.name, member.organisationName]);
  try {
    const response = await reader.readQuestion({ text, today });
    if (response.refused) return null;
    return checkQuestionReading(response.reading, today);
  } catch {
    // Nothing waits on the model: a failed reading is the same as a decline.
    return null;
  }
}
