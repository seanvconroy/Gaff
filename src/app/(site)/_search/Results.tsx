import { Info, SearchX } from 'lucide-react';
import Link from 'next/link';
import {
  awayWords,
  cardLine,
  fitHeading,
  freeFrom,
  missWords,
  saveLabel,
  searchCopy,
} from '@/copy/search';
import {
  filtersToParams,
  hasFilters,
  searchHref,
  type SearchFilters,
} from '@/domain/search/filters';
import { homePageHref } from '@/domain/search/links';
import type { Gazetteer } from '@/domain/search/places';
import { developmentCopy } from '@/copy/developments';
import { type Alike, developmentHref, groupAlike } from '@/domain/developments/development';
import { formatRent, irishToday } from '@/lib/format';
import { findHomes, type HomeOnGaff, nearestHomesTo } from '@/server/search/homes';
import { countSearch } from '@/server/search/search';
import { EmptyState } from '@/ui/EmptyState';
import { HomeCard, HomeGrid } from '@/ui/HomeCard';
import { Skeleton, SkeletonGroup } from '@/ui/Skeleton';
import { SaveHome, TellMeWhen } from './Saving';
import styles from './search.module.css';

/** Who is looking, as far as saving goes: signed out, or the homes and this search they keep. */
export type Saver =
  { signedIn: false } | { signedIn: true; savedRefs: string[]; keepsSearch: boolean };

/**
 * UX-SR-2, UX-SR-6, UX-SR-7, UX-SR-9: the homes under the search box. With no filters, every
 * home on Gaff, newest first. With filters, the homes that fit, then those close to what was
 * asked, each saying the one point it misses; or, when nothing fits, the empty state.
 *
 * UX-SR-10: a search is saved from "Save search" beside Filters, and from the empty state
 * ("Tell me when one comes up", its one primary action).
 */
export async function Results({
  filters,
  g,
  saver,
  beside = false,
}: {
  filters: SearchFilters;
  /** The search's place, looked up (`resolveSearch`). */
  g: Gazetteer;
  saver: Saver;
  /** M57: the list is beside the map, and each card names its pin. */
  beside?: boolean;
}) {
  const { fits, close } = await findHomes(filters, g);
  const searching = hasFilters(filters);
  // UX-SR-15: nothing where they searched: the nearest homes that fit the rest.
  const nearest = fits.length === 0 ? await nearestHomesTo(filters, g) : [];
  if (searching) await countSearch({ fits: fits.length, close: close.length });
  const today = irishToday();
  const query = new URLSearchParams(filtersToParams(filters)).toString();
  const back = searchHref(filters);
  const card = (home: HomeOnGaff, note?: string) => (
    <Card
      key={home.id}
      home={home}
      today={today}
      filters={filters}
      note={note}
      saved={saver.signedIn && saver.savedRefs.includes(home.id)}
      signedIn={saver.signedIn}
      back={back}
      onMap={beside}
    />
  );
  // BA-15 (M75): a development's alike homes are one card per type, as their own step after
  // search has found and ordered the homes (the matcher never sees it).
  const shown = (group: Alike<HomeOnGaff>, note?: string) =>
    group.kind === 'one' ? (
      card(group.home, note)
    ) : (
      <AlikeCard key={group.key} homes={group.homes} today={today} note={note} onMap={beside} />
    );
  const closeGroups = groupAlike(
    close.map((each) => ({
      ...each,
      // Alike homes close to the search for the same reason are one card.
      alikeKey: each.home.alikeKey ? `${each.home.alikeKey}:${missWords(each.miss)}` : null,
    })),
  );
  const keep = searching ? (
    <TellMeWhen
      key={query}
      query={query}
      primary
      signedIn={saver.signedIn}
      kept={saver.signedIn && saver.keepsSearch}
    />
  ) : undefined;

  return (
    <div className={styles.results}>
      {fits.length > 0 ? (
        <section className={styles.section} aria-labelledby="homes-fit">
          <div className={styles.heading}>
            <h2 id="homes-fit" className="type-title">
              {searching ? fitHeading(fits.length) : searchCopy.homesNow}
            </h2>
            {/* M59: what the order is, and that nobody can pay for it: one tap from the results. */}
            <Link
              href="/how-results-are-ordered"
              className={styles.order}
              aria-label={searchCopy.order}
              title={searchCopy.order}
            >
              <Info size={20} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
          <HomeGrid labelledBy="homes-fit" beside={beside}>
            {groupAlike(fits).map((group) => shown(group))}
          </HomeGrid>
        </section>
      ) : (
        <EmptyState
          icon={SearchX}
          title={searching ? searchCopy.empty.title : searchCopy.noHomes.title}
          action={keep}
        >
          <p>{searching ? searchCopy.empty.text : searchCopy.noHomes.text}</p>
        </EmptyState>
      )}
      {nearest.length > 0 ? (
        <section className={styles.section} aria-labelledby="homes-nearest">
          <h2 id="homes-nearest" className="type-title">
            {searchCopy.nearest}
          </h2>
          <HomeGrid labelledBy="homes-nearest" beside={beside}>
            {nearest.map((each) => card(each.home, awayWords(each.metres)))}
          </HomeGrid>
        </section>
      ) : null}
      {close.length > 0 ? (
        <section className={styles.section} aria-labelledby="homes-close">
          <h2 id="homes-close" className="type-title">
            {searchCopy.close}
          </h2>
          <HomeGrid labelledBy="homes-close" beside={beside}>
            {closeGroups.map((group) =>
              group.kind === 'one'
                ? card(group.home.home, missWords(group.home.miss))
                : shown(
                    { kind: 'alike', key: group.key, homes: group.homes.map((each) => each.home) },
                    missWords(group.homes[0]!.miss),
                  ),
            )}
          </HomeGrid>
        </section>
      ) : null}
    </div>
  );
}

/**
 * UX-SR-6: the home's photos (the cover first, the rest to look through in place), the rent,
 * one line, the date it's free, and the heart.
 */
function Card({
  home,
  today,
  filters,
  note,
  saved,
  signedIn,
  back,
  onMap,
}: {
  home: HomeOnGaff;
  today: string;
  filters: SearchFilters;
  note?: string;
  saved: boolean;
  signedIn: boolean;
  back: string;
  /** M117: the home has a pin on the map beside the list, for the two to light each other. */
  onMap: boolean;
}) {
  const line = cardLine(home);
  return (
    <HomeCard
      href={homePageHref(home.id, filters)}
      title={formatRent(home.rentCents)}
      line={line}
      details={[freeFrom(home.availableFrom, today), ...(note ? [note] : [])]}
      photo={home.cover}
      photos={home.photos}
      photosOf={line}
      mapKey={onMap && home.point ? home.id : undefined}
      action={
        <SaveHome
          homeRef={home.id}
          label={saveLabel(line)}
          saved={saved}
          signedIn={signedIn}
          back={back}
        />
      }
    />
  );
}

/**
 * BA-15 (M75): one card for a development's alike homes of one type: the lowest rent, the type
 * and the development, "4 homes like this" and the first date one is free. It opens the type on
 * the development's page, where each home has its own page. Saving is done per home, there.
 */
function AlikeCard({
  homes,
  today,
  note,
  onMap,
}: {
  homes: readonly HomeOnGaff[];
  today: string;
  note?: string;
  onMap: boolean;
}) {
  const first = homes[0]!;
  const alike = first.alike!;
  const from = Math.min(...homes.map((home) => home.rentCents));
  const soonest = homes.map((home) => home.availableFrom).sort()[0]!;
  const pinned = homes.find((home) => home.point);
  return (
    <HomeCard
      href={developmentHref(alike.developmentRef, first.alikeKey ?? undefined)}
      title={developmentCopy.search.from(from)}
      line={`${cardLine(first)} · ${alike.developmentName}`}
      details={[
        developmentCopy.search.alike(homes.length),
        freeFrom(soonest, today),
        ...(note ? [note] : []),
      ]}
      photo={first.cover}
      photos={first.photos}
      photosOf={`${cardLine(first)} · ${alike.developmentName}`}
      mapKey={onMap && pinned ? pinned.id : undefined}
    />
  );
}

/** States table, "Loading": the cards as skeletons, in place, as many across as the cards. */
export function ResultsLoading({ beside = false }: { beside?: boolean }) {
  return (
    <SkeletonGroup label={searchCopy.loading}>
      <div className={styles.skeletons} data-beside={beside || undefined}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeletonCard}>
            <Skeleton shape="photo" />
            <Skeleton shape="title" width="half" />
            <Skeleton width="long" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
