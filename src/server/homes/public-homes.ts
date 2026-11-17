import { type SQL, and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { type Tx, withSystem } from '@/db/client';
import { lettingFacts, lettingPhotos, lettings, organisations } from '@/db/schema';
import {
  type HomeFacts,
  type PublicLister,
  homeHref,
  homePageState,
  homeSummary,
  homeTitle,
  isPublicRef,
  listerMayShowHomes,
  placeOf,
  publicLister,
} from '@/domain/homes/home-page';
import { photoHref } from '@/ports/photo-store';

/**
 * THE PUBLIC QUERY for homes on Gaff (UX-LT-21, UX-LS-1, UX-LS-11): every live home whose lister
 * left "On gaff.ie" on, with a BER and a photo, not hidden, and listed by someone who may have it
 * live. Its card and its page come from here, and nothing else is in them: facts about the home,
 * the four fixed criteria, the lister as renters may know them, and the lister's own number for
 * "Call" (Q43). No renter, no owner, nothing about who has enquired, and no internal ID: a home
 * is known by its public reference.
 *
 * A visitor has no account and a search runs across every lister, so this reads as the system
 * (as `resolveAccessLink` does), and only through these columns. Search reads the same homes
 * through `publicHomesForSearch`, so a home is in search exactly when it has a page.
 */

/** A home's photo on its public page. Photos of homes only, served from Gaff's own address. */
export interface PublicPhoto {
  src: string;
}

/** A live home on Gaff, as its card and its page show it. */
export interface PublicHome {
  /** The page is at `homeHref(ref)`. */
  ref: string;
  href: string;
  home: HomeFacts;
  /** In the lister's order: the first is the cover. Never empty. */
  photos: PublicPhoto[];
  lister: PublicLister;
  /** Q43: the number renters can ring instead, as the lister gave it. Null: no "Call". */
  phone: string | null;
  /** When it went live: homes are newest first. */
  liveAt: Date;
}

/** What a list of homes shows of one (UX-SR-6): the cover, the rent, one line, the date. */
export interface PublicHomeCard {
  href: string;
  title: string;
  line: string;
  photo: { src: string; alt: string };
  availableFrom: string;
}

export function homeCardOf(home: PublicHome): PublicHomeCard {
  return {
    href: home.href,
    title: home.home.addressLine1,
    line: `${homeSummary(home.home)} · ${home.home.area}`,
    // The address is beside it on the card, so the picture adds no words.
    photo: { src: home.photos[0]!.src, alt: '' },
    availableFrom: home.home.availableFrom,
  };
}

/** UX-TS-1: the lister may have a home live (`goLiveGate`), as the database can say it. */
const listerMayShow = or(
  ne(organisations.kind, 'agency'),
  and(
    sql`coalesce(trim(${organisations.psraLicenceNumber}), '') <> ''`,
    isNotNull(organisations.confirmedAt),
    isNull(organisations.licenceLapsedAt),
  ),
)!;

const hasAPhoto = sql`exists (select 1 from ${lettingPhotos} where ${lettingPhotos.lettingId} = ${lettings.id})`;

/** UX-LT-21, UX-LT-22: on gaff.ie, with a BER and a photo, not hidden, by a lister who may show it. */
const onGaff = and(
  eq(lettings.onGaff, true),
  isNull(lettings.hiddenAt),
  isNotNull(lettings.berRating),
  hasAPhoto,
  listerMayShow,
)!;

const columns = {
  id: lettings.id,
  publicRef: lettings.publicRef,
  status: lettings.status,
  onGaff: lettings.onGaff,
  hiddenAt: lettings.hiddenAt,
  pageRemovedAt: lettings.pageRemovedAt,
  liveAt: lettings.liveAt,
  addressLine1: lettings.addressLine1,
  addressLine2: lettings.addressLine2,
  eircode: lettings.eircode,
  area: lettings.area,
  county: lettings.county,
  monthlyRentCents: lettings.monthlyRentCents,
  availableFrom: lettings.availableFrom,
  propertyType: lettings.propertyType,
  bedrooms: lettings.bedrooms,
  bathrooms: lettings.bathrooms,
  furnished: lettings.furnished,
  parking: lettings.parking,
  berRating: lettings.berRating,
  description: lettings.description,
  criteria: lettings.criteria,
  noSmokingIndoors: lettings.noSmokingIndoors,
  listerKind: organisations.kind,
  listerName: organisations.name,
  psraLicenceNumber: organisations.psraLicenceNumber,
  confirmedAt: organisations.confirmedAt,
  licenceLapsedAt: organisations.licenceLapsedAt,
  phone: organisations.phone,
};

function selectRows(tx: Tx, where: SQL) {
  return tx
    .select(columns)
    .from(lettings)
    .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
    .where(where)
    .orderBy(desc(lettings.liveAt), desc(lettings.createdAt));
}

type Row = Awaited<ReturnType<typeof selectRows>>[number];

interface Loaded {
  row: Row;
  photos: PublicPhoto[];
  facts: string[];
}

async function load(tx: Tx, where: SQL, limit?: number): Promise<Loaded[]> {
  const rows = limit ? await selectRows(tx, where).limit(limit) : await selectRows(tx, where);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const photos = await tx
    .select({ lettingId: lettingPhotos.lettingId, storageKey: lettingPhotos.storageKey })
    .from(lettingPhotos)
    .where(inArray(lettingPhotos.lettingId, ids))
    .orderBy(asc(lettingPhotos.position), asc(lettingPhotos.createdAt));
  // "Anything else renters often ask?", as set up. Answers to renters' questions stay off the
  // page: they were written for one conversation.
  const facts = await tx
    .select({ lettingId: lettingFacts.lettingId, answer: lettingFacts.answer })
    .from(lettingFacts)
    .where(
      and(
        inArray(lettingFacts.lettingId, ids),
        eq(lettingFacts.source, 'setup'),
        isNull(lettingFacts.retiredAt),
      ),
    )
    .orderBy(asc(lettingFacts.createdAt));
  return rows.map((row) => ({
    row,
    photos: photos
      .filter((photo) => photo.lettingId === row.id)
      .map((photo) => ({ src: photoHref(photo.storageKey) })),
    facts: facts.filter((fact) => fact.lettingId === row.id).map((fact) => fact.answer),
  }));
}

function listerOf(row: Row) {
  return {
    kind: row.listerKind,
    name: row.listerName,
    psraLicenceNumber: row.psraLicenceNumber,
    confirmedAt: row.confirmedAt,
    licenceLapsedAt: row.licenceLapsedAt,
  };
}

function stateOf({ row, photos }: Loaded) {
  return homePageState({
    status: row.status,
    onGaff: row.onGaff,
    berRating: row.berRating,
    photos: photos.length,
    hiddenAt: row.hiddenAt,
    pageRemovedAt: row.pageRemovedAt,
    listerMayShow: listerMayShowHomes(listerOf(row)),
  });
}

function factsOf({ row, facts }: Loaded): HomeFacts {
  return {
    addressLine1: row.addressLine1,
    area: row.area,
    county: row.county,
    monthlyRentCents: row.monthlyRentCents,
    availableFrom: row.availableFrom,
    propertyType: row.propertyType,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    furnished: row.furnished,
    parking: row.parking,
    berRating: row.berRating,
    description: row.description,
    criteria: row.criteria,
    noSmokingIndoors: row.noSmokingIndoors,
    facts,
  };
}

function toPublicHome(loaded: Loaded): PublicHome {
  const { row, photos } = loaded;
  return {
    ref: row.publicRef,
    href: homeHref(row.publicRef),
    home: factsOf(loaded),
    photos,
    lister: publicLister(listerOf(row)),
    phone: row.phone?.trim() || null,
    liveAt: row.liveAt ?? new Date(0),
  };
}

/**
 * What search matches a home on (UX-SR-4, UX-SR-5): where it is, and the same facts its page
 * shows. The second address line and the Eircode are here only to place the home in a town or a
 * Dublin district: search never shows them.
 */
export interface PlacedHome {
  home: PublicHome;
  addressLine2: string | null;
  eircode: string | null;
}

/** Every live home on Gaff, newest first, for search to match. The same homes as `publicHomes`. */
export async function publicHomesForSearch(): Promise<PlacedHome[]> {
  const loaded = await withSystem((tx) => load(tx, and(eq(lettings.status, 'live'), onGaff)!));
  return loaded
    .filter((home) => stateOf(home) === 'live')
    .map((home) => ({
      home: toPublicHome(home),
      addressLine2: home.row.addressLine2,
      eircode: home.row.eircode,
    }));
}

/** What a search can ask of the homes on Gaff. WP-21 adds its filters here. */
export interface PublicHomesQuery {
  /** One home, by its public reference. */
  ref?: string;
  limit?: number;
}

/** Live homes on Gaff, newest first: each one's card and page data, and nothing else. */
export async function publicHomes(query: PublicHomesQuery = {}): Promise<PublicHome[]> {
  if (query.ref !== undefined && !isPublicRef(query.ref)) return [];
  const loaded = await withSystem((tx) =>
    load(
      tx,
      and(
        eq(lettings.status, 'live'),
        onGaff,
        query.ref !== undefined ? eq(lettings.publicRef, query.ref) : undefined,
      )!,
      query.limit,
    ),
  );
  // The domain's rule has the last word, so the page and search can never disagree with it.
  return loaded.filter((home) => stateOf(home) === 'live').map(toPublicHome);
}

/** What a home's address shows (UX-LS-1, UX-LS-10): its page, "has been let", or nothing. */
export type PublicHomePage =
  | { state: 'live'; home: PublicHome }
  | {
      state: 'let';
      title: string;
      /** "Ranelagh": for "See other homes in Ranelagh". */
      place: string;
    };

/** A home's page by its public reference. Null: "not available", whatever the reason. */
export async function publicHomePage(ref: string): Promise<PublicHomePage | null> {
  if (!isPublicRef(ref)) return null;
  const [found] = await withSystem((tx) =>
    load(
      tx,
      and(eq(lettings.publicRef, ref), inArray(lettings.status, ['live', 'let']), onGaff)!,
      1,
    ),
  );
  if (!found) return null;
  const state = stateOf(found);
  if (state === 'live') return { state, home: toPublicHome(found) };
  if (state === 'let') {
    return { state, title: homeTitle(found.row), place: placeOf(found.row.area) };
  }
  return null;
}

/**
 * The letting behind a live home's public reference, for what a visitor does from its page
 * (asking to view, WP-22; reporting it, WP-26). Everything after it is scoped to the lister.
 */
export async function resolvePublicHome(
  ref: string,
): Promise<{ organisationId: string; lettingId: string } | null> {
  if (!isPublicRef(ref)) return null;
  const [found] = await withSystem((tx) =>
    tx
      .select({ organisationId: lettings.organisationId, lettingId: lettings.id })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(and(eq(lettings.publicRef, ref), eq(lettings.status, 'live'), onGaff)),
  );
  return found ?? null;
}
