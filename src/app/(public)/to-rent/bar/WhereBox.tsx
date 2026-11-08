'use client';

import {
  Building2,
  Clock,
  GraduationCap,
  Hospital,
  MapPin,
  Route,
  Search,
  ShoppingBag,
  TrainFront,
  Trees,
  TrendingUp,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SuggestionItem, SuggestionsResponse } from '@/app/api/places/route';
import type { LandmarkKind } from '@/domain/places/gazetteer';
import { useSearchNavigation } from '../navigation';
import styles from './bar.module.css';

/**
 * M56, M114, M121: the Where box. The WAI-ARIA combobox pattern with a grouped listbox: places,
 * streets and landmarks from Gaff's own index, popular places and this visit's recent searches
 * before anything is typed, and "Did you mean …?" for a near spelling. Choosing a suggestion
 * opens its search with the filters kept. Without JavaScript it's a plain text box, and the
 * server finds the best match (`/search`).
 */

const RECENT_KEY = 'gaff.recentSearches';
const MAX_RECENT = 5;

interface Recent {
  name: string;
  description: string;
  path: string;
}

/**
 * M114: a visitor's recent searches, for this visit: kept in the tab only, never sent anywhere.
 * A signed-in renter's come from their account instead.
 */
function readRecent(): Recent[] {
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? '[]') as Recent[];
  } catch {
    return [];
  }
}

function remember(item: Recent) {
  try {
    const rest = readRecent().filter((r) => r.path !== item.path);
    sessionStorage.setItem(RECENT_KEY, JSON.stringify([item, ...rest].slice(0, MAX_RECENT)));
  } catch {
    // Private browsing can refuse storage; recent searches are a nicety.
  }
}

type Group = {
  kind: string;
  label: string;
  items: Array<SuggestionItem | (Recent & { kind: 'recent'; slug: string })>;
};

const groupLabels: Record<string, string> = {
  places: 'Places',
  streets: 'Streets',
  landmarks: 'Landmarks',
  popular: 'Popular places',
  recent: 'Recent searches',
};

function OptionIcon({ kind, landmarkKind }: { kind: string; landmarkKind?: LandmarkKind }) {
  const props = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const;
  if (kind === 'recent') return <Clock {...props} />;
  if (kind === 'street') return <Route {...props} />;
  if (kind === 'landmark') {
    switch (landmarkKind) {
      case 'hospital':
        return <Hospital {...props} />;
      case 'college':
        return <GraduationCap {...props} />;
      case 'station':
        return <TrainFront {...props} />;
      case 'park':
        return <Trees {...props} />;
      case 'shopping_centre':
        return <ShoppingBag {...props} />;
      default:
        return <Building2 {...props} />;
    }
  }
  return <MapPin {...props} />;
}

/** The name with the part that matches what was typed in bold. */
function Highlighted({ name, typed }: { name: string; typed: string }) {
  const q = typed.trim().toLowerCase();
  const at = q ? name.toLowerCase().indexOf(q) : -1;
  if (at === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, at)}
      <b>{name.slice(at, at + q.length)}</b>
      {name.slice(at + q.length)}
    </>
  );
}

export function WhereBox({
  label,
  filtersQuery,
  everywhereHref,
  autoFocus = false,
  onChosen,
  recent: accountRecent,
}: {
  /** What the box shows for the current search: "Rathmines", "Map area". */
  label: string;
  /** The current filters as a query, kept when a new place is chosen. */
  filtersQuery: string;
  /** Where clearing the box goes: all of Ireland, with the filters. */
  everywhereHref: string;
  autoFocus?: boolean;
  onChosen?: () => void;
  /** M114: a signed-in renter's recent searches, from their account; otherwise this tab's. */
  recent?: Recent[];
}) {
  const id = useId();
  const { navigate } = useSearchNavigation();
  const [value, setValue] = useState(label);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<Record<string, SuggestionsResponse>>({});
  const [popular, setPopular] = useState<SuggestionsResponse | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const typed = value.trim();
  const showingTyped = typed.length > 0 && typed !== label;
  const response = results[typed.toLowerCase()] ?? null;

  useEffect(() => {
    if (!open || showingTyped || popular) return;
    const controller = new AbortController();
    fetch('/api/places', { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SuggestionsResponse>) : null))
      .then((body) => body && setPopular(body))
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, showingTyped, popular]);

  useEffect(() => {
    const key = typed.toLowerCase();
    if (!open || !showingTyped || key in results) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(typed)}`, {
          signal: controller.signal,
        });
        if (r.ok) {
          const body = (await r.json()) as SuggestionsResponse;
          setResults((prev) => ({ ...prev, [key]: body }));
        }
      } catch {
        // A cancelled or failed lookup leaves a plain text box; Enter still searches.
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [typed, open, showingTyped, results]);

  const groups: Group[] = useMemo(() => {
    if (showingTyped) {
      return (response?.groups ?? []).map((g) => ({
        kind: g.kind,
        label: groupLabels[g.kind] ?? g.kind,
        items: g.items,
      }));
    }
    const out: Group[] = [];
    if (recent.length) {
      out.push({
        kind: 'recent',
        label: groupLabels.recent!,
        items: recent.map((r) => ({ ...r, kind: 'recent' as const, slug: r.path })),
      });
    }
    const popularItems = popular?.groups[0]?.items ?? [];
    if (popularItems.length) {
      out.push({ kind: 'popular', label: groupLabels.popular!, items: popularItems });
    }
    return out;
  }, [showingTyped, response, recent, popular]);

  const options = groups.flatMap((g) => g.items);
  const shown = open && (options.length > 0 || (showingTyped && response !== null && !loading));
  const didYouMean = showingTyped && response?.didYouMean;
  const nothing = showingTyped && response !== null && options.length === 0 && !loading;

  function choose(option: (typeof options)[number]) {
    // Signed-in renters' searches are remembered with their account when the page opens.
    if (!accountRecent) {
      remember({ name: option.name, description: option.description, path: option.path });
    }
    setValue(option.name);
    setOpen(false);
    input.current?.blur();
    onChosen?.();
    navigate(filtersQuery ? `${option.path}?${filtersQuery}` : option.path);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      if (options.length) setActive((i) => (i + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length) setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      // The highlighted suggestion, or the best one; with none, the form asks the server.
      const option = options[active] ?? (showingTyped ? options[0] : undefined);
      if (option) {
        event.preventDefault();
        choose(option);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        setOpen(false);
        setActive(-1);
      } else {
        setValue('');
      }
    }
  }

  let index = -1;
  return (
    <div className={styles.where}>
      <label htmlFor={`${id}-where`} className="visually-hidden">
        Where do you want to live?
      </label>
      <div className={styles.whereField} data-open={shown || undefined}>
        <Search className={styles.whereIcon} size={20} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={input}
          id={`${id}-where`}
          name="where"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={`${id}-list`}
          aria-activedescendant={shown && active >= 0 ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-status`}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Town, area, street or Eircode"
          className={styles.whereInput}
          value={value}
          // M56: renters type straight away on the phone's search sheet, which focuses this.
          data-autofocus={autoFocus || undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={(event) => {
            setRecent(accountRecent ?? readRecent());
            setOpen(true);
            event.target.select();
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {value ? (
          <button
            type="button"
            className={styles.whereClear}
            aria-label="Clear where"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (label && value === label) {
                navigate(everywhereHref);
                setValue('');
              } else {
                setValue('');
                input.current?.focus();
              }
            }}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p id={`${id}-status`} className="visually-hidden" aria-live="polite">
        {shown
          ? nothing
            ? `We couldn’t find ${typed}`
            : `${options.length} suggestion${options.length === 1 ? '' : 's'}`
          : ''}
      </p>
      <div className={styles.suggest} hidden={!shown}>
        {didYouMean ? (
          <p className={styles.suggestNote}>We couldn’t find “{typed}”. Did you mean:</p>
        ) : null}
        {nothing ? (
          <p className={styles.suggestNote}>
            We couldn’t find “{typed}”. Try a county, town, area, street or Eircode.
          </p>
        ) : null}
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Suggestions"
          className={styles.suggestList}
        >
          {groups.map((group) => (
            <li key={group.kind} role="presentation">
              <ul
                role="group"
                aria-labelledby={`${id}-group-${group.kind}`}
                className={styles.group}
              >
                <li
                  role="presentation"
                  id={`${id}-group-${group.kind}`}
                  className={styles.groupLabel}
                >
                  {group.label}
                </li>
                {group.items.map((option) => {
                  index++;
                  const i = index;
                  return (
                    <li
                      key={`${group.kind}-${option.path}`}
                      id={`${id}-option-${i}`}
                      role="option"
                      aria-selected={i === active}
                      className={styles.option}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(option)}
                    >
                      <span className={styles.optionTile}>
                        {group.kind === 'popular' ? (
                          <TrendingUp size={20} strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <OptionIcon
                            kind={option.kind}
                            landmarkKind={
                              'landmarkKind' in option ? option.landmarkKind : undefined
                            }
                          />
                        )}
                      </span>
                      <span className={styles.optionText}>
                        <span className={styles.optionName}>
                          <Highlighted name={option.name} typed={showingTyped ? typed : ''} />
                        </span>
                        <span className={styles.optionMore}>{option.description}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        <p className={styles.suggestFoot}>Places © OpenStreetMap contributors</p>
      </div>
    </div>
  );
}
