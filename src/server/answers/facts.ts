import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { lettingFacts, type lettings, viewingSessions } from '@/db/schema';
import type { Fact } from '@/domain/answers/guardrails';
import { describeCriteria } from '@/domain/criteria/criteria';
import {
  describeKeyFacts,
  type berRatings,
  type furnishing,
  type parkingOptions,
  type propertyTypes,
} from '@/domain/lettings/new-letting';
import { formatDate, formatRent, formatTimeRange } from '@/lib/format';

type Letting = typeof lettings.$inferSelect;

/**
 * R8: everything the AI may answer from, each with an ID it must cite: the key facts, rent,
 * availability, viewing times and criteria, plus the facts and answers the operator added.
 * Nothing about any renter is ever a fact.
 */
export async function factsFor(tx: Tx, letting: Letting): Promise<Fact[]> {
  const facts: Fact[] = [
    { id: 'core:address', text: `Address: ${letting.addressLine1}, ${letting.area}` },
    { id: 'core:rent', text: `Rent: ${formatRent(letting.monthlyRentCents)}` },
    { id: 'core:available', text: `Available from ${formatDate(letting.availableFrom)}` },
    ...describeKeyFacts({
      propertyType: letting.propertyType as keyof typeof propertyTypes,
      bedrooms: letting.bedrooms,
      bathrooms: letting.bathrooms,
      furnished: letting.furnished as keyof typeof furnishing,
      berRating: letting.berRating as (typeof berRatings)[number],
      parking: letting.parking as keyof typeof parkingOptions | null,
    }).map((fact) => ({
      id: `core:${fact.label.toLowerCase().replace(/\W+/g, '-')}`,
      text: `${fact.label}: ${fact.value}`,
    })),
  ];
  if (letting.photosUrl) facts.push({ id: 'core:photos', text: `Photos: ${letting.photosUrl}` });
  for (const [i, line] of describeCriteria(letting.criteria ?? { noPets: false }).entries()) {
    facts.push({ id: `core:criteria-${i + 1}`, text: `Criteria for viewing: ${line}` });
  }
  const sessions = await tx
    .select({ startsAt: viewingSessions.startsAt, endsAt: viewingSessions.endsAt })
    .from(viewingSessions)
    .where(eq(viewingSessions.lettingId, letting.id))
    .orderBy(asc(viewingSessions.startsAt));
  if (sessions.length > 0) {
    facts.push({
      id: 'core:viewings',
      text: `Viewing times (renters book after they're invited): ${sessions
        .map((s) => `${formatDate(s.startsAt)}, ${formatTimeRange(s.startsAt, s.endsAt)}`)
        .join('; ')}`,
    });
  }
  const added = await tx
    .select({ id: lettingFacts.id, question: lettingFacts.question, answer: lettingFacts.answer })
    .from(lettingFacts)
    .where(and(eq(lettingFacts.lettingId, letting.id), isNull(lettingFacts.retiredAt)))
    .orderBy(asc(lettingFacts.createdAt));
  for (const fact of added) {
    facts.push({
      id: fact.id,
      text: fact.question ? `Asked: ${fact.question} Answer: ${fact.answer}` : fact.answer,
    });
  }
  return facts;
}
