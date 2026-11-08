import { and, asc, eq, isNull } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { lettingFacts } from '@/db/schema';
import type { Fact } from '@/domain/answers/guardrails';
import { descriptionProblem, type DescriptionProblem } from '@/domain/ai/validators';
import {
  accessibilityFeatures,
  appliances,
  broadbandTypes,
  furnishing,
  heatingTypes,
  outdoorSpaces,
  parkingOptions,
  propertyTypes,
} from '@/domain/homes/facts';
import { formatDate } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { UserFacingError } from '@/server/errors';
import { recordEvent } from '@/server/record/events';
import { runAi } from '@/server/ai/usage';
import { homeBer, loadListing, type ListingContext } from './context';

const label = <T extends Record<string, string>>(labels: T, key: string | null) =>
  key && key in labels ? labels[key as keyof T] : null;

/**
 * M45, P10: the facts a drafted description may use: the home's own facts and the letter's
 * other facts. Never the rent, the criteria, viewing times or anything about a renter, and the
 * area only by name (M38: the street may be hidden).
 */
export function descriptionFacts(
  context: ListingContext,
  otherFacts: Array<{ id: string; text: string }> = [],
): Fact[] {
  const { home, letting } = context;
  const facts: Array<Fact | null> = [
    { id: 'home:type', text: `Type: ${label(propertyTypes, home.propertyType) ?? 'Home'}` },
    { id: 'home:area', text: `Area: ${home.area}, ${home.county}` },
    { id: 'home:bedrooms', text: `Bedrooms: ${home.bedrooms}` },
    { id: 'home:bathrooms', text: `Bathrooms: ${home.bathrooms}` },
    home.ensuites ? { id: 'home:ensuites', text: `En suite bathrooms: ${home.ensuites}` } : null,
    home.floorAreaSqm
      ? { id: 'home:floor-area', text: `Floor area: ${home.floorAreaSqm} square metres` }
      : null,
    home.floor !== null
      ? {
          id: 'home:floor',
          text: `Floor: ${home.floor === 0 ? 'Ground floor' : `Floor ${home.floor}`}${home.hasLift ? ', with a lift' : ''}`,
        }
      : null,
    label(heatingTypes, home.heating)
      ? { id: 'home:heating', text: `Heating: ${label(heatingTypes, home.heating)}` }
      : null,
    label(outdoorSpaces, home.outdoorSpace)
      ? { id: 'home:outdoor', text: `Outdoor space: ${label(outdoorSpaces, home.outdoorSpace)}` }
      : null,
    label(parkingOptions, letting.parking)
      ? { id: 'home:parking', text: `Parking: ${label(parkingOptions, letting.parking)}` }
      : null,
    label(furnishing, letting.furnished)
      ? { id: 'home:furnished', text: `Furnished: ${label(furnishing, letting.furnished)}` }
      : null,
    home.appliances.length
      ? {
          id: 'home:appliances',
          text: `Appliances: ${home.appliances.map((a) => label(appliances, a) ?? a).join(', ')}`,
        }
      : null,
    home.accessibility.length
      ? {
          id: 'home:accessibility',
          text: `Accessibility: ${home.accessibility.map((a) => label(accessibilityFeatures, a) ?? a).join(', ')}`,
        }
      : null,
    label(broadbandTypes, home.broadband)
      ? { id: 'home:broadband', text: `Broadband: ${label(broadbandTypes, home.broadband)}` }
      : null,
    { id: 'home:ber', text: `BER: ${berWords(context)}` },
    { id: 'home:available', text: `Available from ${formatDate(letting.availableFrom)}` },
  ];
  return [...facts.filter((f): f is Fact => f !== null), ...otherFacts];
}

function berWords(context: ListingContext): string {
  const ber = homeBer(context.home);
  return ber.kind === 'exempt' ? 'Exempt' : ber.rating;
}

export type DraftedDescription = { ok: true; description: string } | { ok: false; message: string };

const UNAVAILABLE =
  'Gaff couldn’t draft a description just now. Write your own, or try again in a few minutes.';

/**
 * M45, P10, P11: drafts a description from the facts the letter entered. It isn't saved: it goes
 * into the editor, marked as drafted by AI, and only the letter saves or publishes it. A draft
 * that fails Gaff's checks is never shown (P5).
 */
export async function draftListingDescription(
  member: Member,
  lettingId: string,
): Promise<DraftedDescription> {
  const loaded = await withOrg(member.organisationId, async (tx) => {
    const context = await loadListing(tx, lettingId);
    if (!context) return null;
    const added = await tx
      .select({ id: lettingFacts.id, question: lettingFacts.question, answer: lettingFacts.answer })
      .from(lettingFacts)
      .where(and(eq(lettingFacts.lettingId, lettingId), isNull(lettingFacts.retiredAt)))
      .orderBy(asc(lettingFacts.createdAt));
    // Only the letter's own statements about the home: answers to one renter's question stay out.
    const other = added.filter((f) => !f.question).map((f) => ({ id: f.id, text: f.answer }));
    return { context, facts: descriptionFacts(context, other) };
  });
  if (!loaded) throw new UserFacingError('We couldn’t find that listing.');

  const run = await runAi({
    task: 'description',
    organisationId: member.organisationId,
    call: (ai) => ai.draftDescription({ facts: loaded.facts }),
  });
  let problem: DescriptionProblem | 'unavailable' | null = null;
  if (run.outcome !== 'ok') problem = 'unavailable';
  else problem = descriptionProblem(run.output, loaded.facts);

  await withOrg(member.organisationId, (tx) =>
    recordEvent(tx, {
      organisationId: member.organisationId,
      lettingId,
      actor: { type: 'ai' },
      type: 'listing.description_drafted',
      subject: { type: 'listing', id: loaded.context.listing.id },
      data: {
        listingId: loaded.context.listing.id,
        accepted: problem === null,
        ...(problem ? { problem } : {}),
      },
    }),
  );
  if (problem !== null || run.outcome !== 'ok') return { ok: false, message: UNAVAILABLE };
  return { ok: true, description: run.output.description.trim() };
}
