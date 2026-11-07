import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, type Tx } from '@/db/client';
import {
  declarations,
  homes,
  letterChecks,
  lettings,
  listings,
  media,
  memberships,
  organisations,
  users,
} from '@/db/schema';
import type { Criteria } from '@/domain/criteria/criteria';
import { berFromLettingRating, type Ber } from '@/domain/homes/ber';
import type { ProjectionLetter, ProjectionPhoto } from '@/domain/listings/projection';
import { badgeWords } from '@/domain/verification/readiness';

/** Everything about one letting's listing, read inside the organisation's transaction. */
export async function loadListing(tx: Tx, lettingId: string) {
  const [row] = await tx
    .select({ letting: lettings, home: homes, listing: listings })
    .from(lettings)
    .innerJoin(homes, eq(homes.id, lettings.homeId))
    .innerJoin(listings, eq(listings.lettingId, lettings.id))
    .where(eq(lettings.id, lettingId));
  if (!row) return null;
  const photos = await tx
    .select()
    .from(media)
    .where(
      and(
        eq(media.homeId, row.home.id),
        inArray(media.kind, ['photo', 'floor_plan']),
        inArray(media.status, ['uploading', 'processing', 'ready', 'rejected']),
      ),
    )
    .orderBy(asc(media.position));
  const [declared] = await tx
    .select({ id: declarations.id })
    .from(declarations)
    .where(eq(declarations.homeId, row.home.id))
    .limit(1);
  return { ...row, photos, declared: Boolean(declared) };
}

export type ListingContext = NonNullable<Awaited<ReturnType<typeof loadListing>>>;

export function homeBer(home: ListingContext['home']): Ber {
  if (home.berRating === 'exempt') {
    return { kind: 'exempt', reason: home.berExemptReason ?? 'other' };
  }
  return home.berScale
    ? { kind: 'rated', scale: home.berScale, rating: home.berRating }
    : berFromLettingRating(home.berRating);
}

export function readyPhotos(context: ListingContext): ProjectionPhoto[] {
  return context.photos
    .filter((p) => p.status === 'ready' && p.widths && p.width && p.height)
    .map((p) => ({
      key: `${p.organisationId}/${p.id}`,
      kind: p.kind === 'floor_plan' ? ('floor_plan' as const) : ('photo' as const),
      widths: p.widths!,
      width: p.width!,
      height: p.height!,
      alt: p.altText,
      placeholder: p.placeholder,
      cgi: p.isCgi,
    }));
}

/**
 * M19, M26, M70: the letter as renters see them: the agency and the agent handling it, or a
 * private landlord's first name, with the badges for what Gaff has checked.
 */
export async function letterCard(
  tx: Tx,
  organisationId: string,
  agentUserId: string,
  now = new Date(),
): Promise<ProjectionLetter> {
  const [organisation] = await db()
    .select({ name: organisations.name, kind: organisations.kind })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
  const [agent] = await db()
    .select({
      displayName: memberships.displayName,
      name: users.name,
      showPhone: memberships.showPhone,
      publicPhone: memberships.publicPhone,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(eq(memberships.organisationId, organisationId), eq(memberships.userId, agentUserId)),
    );
  const checks = await tx
    .select()
    .from(letterChecks)
    .where(
      and(
        eq(letterChecks.organisationId, organisationId),
        eq(letterChecks.status, 'passed'),
        or(isNull(letterChecks.userId), eq(letterChecks.userId, agentUserId)),
      ),
    );
  const badges = checks
    .map((c) => badgeWords({ ...c }, now))
    .filter((b): b is string => b !== null);
  const agentName = agent?.displayName ?? agent?.name ?? null;
  if (organisation!.kind === 'landlord') {
    const verified = checks.find((c) => c.method === 'id_document')?.verifiedName;
    const first = (verified ?? agentName ?? organisation!.name).split(' ')[0] ?? organisation!.name;
    return { kind: 'landlord', name: first, agentName: null, agentPhone: null, badges };
  }
  return {
    kind: 'agency',
    name: organisation!.name,
    agentName,
    agentPhone: agent?.showPhone ? (agent.publicPhone ?? null) : null,
    badges,
  };
}

export function criteriaOf(context: ListingContext): Criteria | null {
  return context.letting.criteria ?? null;
}
