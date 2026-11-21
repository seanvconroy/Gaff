import { MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { placePageCopy as copy } from '@/copy/place-pages';
import { homesCount } from '@/copy/search';
import { isLikelyBot } from '@/domain/map/robots';
import {
  type CountedPlace,
  placePageName,
  placePageRobots,
  placePath,
} from '@/domain/search/place-pages';
import { env } from '@/lib/env';
import { mapSettings } from '@/lib/map';
import { currentPerson } from '@/server/context/current-person';
import { savedHomeRefs } from '@/server/saved/homes';
import { keepsSearch } from '@/server/saved/searches';
import { placePageFor } from '@/server/search/place-pages';
import { ActionList, ActionRow } from '@/ui/ActionList';
import type { Saver } from '../../_search/Results';
import { SearchView } from '../../_search/SearchView';
import styles from '../places.module.css';

type Query = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ place?: string[] }>; searchParams: Promise<Query> };

/** One read per request, shared by the page and its metadata. */
const pageFor = cache(async (segments: readonly string[], query: string) =>
  placePageFor(segments, Object.fromEntries(new URLSearchParams(query))),
);

async function resolve({ params, searchParams }: Props) {
  const [{ place = [] }, query] = await Promise.all([params, searchParams]);
  const pairs = Object.entries(query).flatMap(([key, value]) =>
    typeof value === 'string' ? [[key, value] as [string, string]] : [],
  );
  const page = await pageFor(place, new URLSearchParams(pairs).toString());
  if (page.kind === 'not_found') notFound();
  // M62: one address for a place. Other spellings and old addresses go there for good.
  if (page.kind === 'redirect') permanentRedirect(page.path);
  return page;
}

/**
 * M62, M111, UX-LS-11: a place's page may be indexed only where the deployment says so
 * (SEARCH_INDEXING=on, production alone) and only while it has a home on Gaff. Its canonical
 * address is its own (M58).
 */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const page = await resolve(props);
  const name = placePageName(page.place);
  return {
    metadataBase: new URL(env().APP_URL),
    title: copy.heading(name),
    description: copy.description(name),
    alternates: { canonical: page.path },
    robots: placePageRobots({
      liveHomes: page.place.liveHomes,
      searchIndexing: env().SEARCH_INDEXING === 'on',
    }),
  };
}

/**
 * M62 (BA-12): a place's page, `/to-rent/<county>/<place>` or a county's `/to-rent/<county>`.
 * It is the redesign's search already answered for that place (UX-SR-1 to UX-SR-12): the same
 * box, chips, filters, homes, map and "Save search", under a heading that names the
 * place, with one line saying how many homes are free there. Changing a filter makes the search
 * at the first screen, as every filtered search is. Under the homes: the places around it and
 * its county; a place with no homes offers wider places that have some.
 *
 * Anyone can open it, signed in or not; nothing is recorded against anyone (UX-SR-11).
 */
export default async function PlacePage(props: Props) {
  const [page, person] = await Promise.all([resolve(props), currentPerson()]);
  const name = placePageName(page.place);
  const saver: Saver = person
    ? {
        signedIn: true,
        savedRefs: await savedHomeRefs(person.userId),
        keepsSearch: await keepsSearch(person.userId, page.filters),
      }
    : { signedIn: false };
  // M132: no map for robots, so Google's script never loads and no map load is billed for them.
  const map = isLikelyBot((await headers()).get('user-agent')) ? null : mapSettings();
  const homes = page.place.liveHomes;
  return (
    <SearchView
      question={copy.heading(name)}
      heading="shown"
      filters={page.filters}
      g={page.g}
      placeName={page.placeName}
      where={page.where}
      saver={saver}
      map={map}
      keepRent={false}
      intro={<p className={styles.free}>{copy.free(homes, page.placeName)}</p>}
      after={
        homes > 0 ? (
          <Places
            id="places-near"
            heading={page.place.kind === 'county' ? copy.inCounty(name) : copy.nearby(name)}
            places={page.nearby}
            county={page.county}
          />
        ) : (
          <Places
            id="places-wider"
            heading={copy.wider}
            places={page.wider}
            counted
            everywhere={page.wider.length === 0}
          />
        )
      }
    />
  );
}

/** The places a page links to, as hairline rows under a heading. */
function Places({
  id,
  heading,
  places,
  county,
  counted,
  everywhere,
}: {
  id: string;
  heading: string;
  places: readonly CountedPlace[];
  county?: CountedPlace | null;
  /** Each row says how many homes the place has. */
  counted?: boolean;
  /** No place nearby has a home: every home on Gaff instead. */
  everywhere?: boolean;
}) {
  if (places.length === 0 && !county && !everywhere) return null;
  return (
    <section className={styles.places} aria-labelledby={id}>
      <h2 id={id} className="type-heading">
        {heading}
      </h2>
      <ActionList bare labelledBy={id}>
        {places.map((place) => (
          <ActionRow
            key={place.slug}
            id={`${id}-${place.slug}`}
            href={placePath(place)}
            icon={MapPin}
            title={
              counted ? copy.withHomes(placePageName(place), place.liveHomes) : placePageName(place)
            }
            meta={!counted && place.liveHomes > 0 ? homesCount(place.liveHomes) : undefined}
          />
        ))}
        {county ? (
          <ActionRow
            id={`${id}-county`}
            href={placePath(county)}
            icon={MapPin}
            title={copy.county(placePageName(county))}
            meta={county.liveHomes > 0 ? homesCount(county.liveHomes) : undefined}
          />
        ) : null}
        {everywhere ? (
          <ActionRow id={`${id}-everywhere`} href="/" icon={MapPin} title={copy.everywhere} />
        ) : null}
      </ActionList>
    </section>
  );
}
