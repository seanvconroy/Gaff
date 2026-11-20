'use client';

import {
  Clock,
  GraduationCap,
  Hash,
  Hospital,
  Landmark,
  MapPin,
  Route,
  Search,
  ShoppingBag,
  TrainFront,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { controlClass, describedBy, type FieldBase, FieldFrame, fieldIds } from './Field';
import styles from './PlaceSearch.module.css';

/** What a place suggestion shows, and what picking it gives back. */
export interface PlaceOption {
  /** What picking it keeps: a place's slug. */
  id: string;
  /** Its name, with the typed part in bold. */
  name: string;
  /** What the field says once it's picked: "Kinsale, Co. Cork". */
  label: string;
  /** Under the name: "Town in County Cork · 4 homes". */
  description: string;
  icon: PlaceIcon;
}

export type PlaceIcon =
  | 'place'
  | 'street'
  | 'routing_key'
  | 'recent'
  | 'landmark'
  | 'college'
  | 'hospital'
  | 'station'
  | 'park'
  | 'shopping_centre';

export interface PlaceGroup {
  label: string;
  options: PlaceOption[];
}

export interface PlaceSuggestions {
  groups: PlaceGroup[];
  /** Only near spellings matched what was typed: the list offers them as "Did you mean". */
  didYouMean: boolean;
}

export const placeIcons: Record<PlaceIcon, LucideIcon> = {
  place: MapPin,
  street: Route,
  routing_key: Hash,
  recent: Clock,
  landmark: Landmark,
  college: GraduationCap,
  hospital: Hospital,
  station: TrainFront,
  park: Trees,
  shopping_centre: ShoppingBag,
};

/** The fewest characters worth looking up, and how long to wait after the last one. */
const SHORTEST = 2;
const PAUSE_MS = 120;
/** Answers kept, so deleting a letter is instant. */
const KEEP_ANSWERS = 20;

/** The typed part of a name in bold, wherever a word of the name starts with it. */
export function withTyped(name: string, typed: string): ReactNode {
  const plain = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const query = plain(typed.trim());
  if (!query) return name;
  const folded = plain(name);
  // Folding can change a name's length (a fada is its own character); bold only when it doesn't.
  if (folded.length !== name.length) return name;
  let at = folded.startsWith(query) ? 0 : folded.indexOf(` ${query}`);
  if (at < 0) return name;
  if (at > 0) at += 1;
  return (
    <>
      {name.slice(0, at)}
      <strong>{name.slice(at, at + query.length)}</strong>
      {name.slice(at + query.length)}
    </>
  );
}

/**
 * Place search (section 8; M56, M121): the field under "Where". Suggestions come as the person
 * types, grouped as Places, Streets and Landmarks, each with where it is and the homes there.
 * Focused before typing, it shows what was searched this visit and the places with homes. When
 * only near spellings match, it says so and offers them ("Did you mean"). Under the list, the
 * credit the place data's licence asks for.
 *
 * It is a combobox: ↓ and ↑ move through the suggestions, Enter picks one, Escape closes them and
 * then clears the text, and Tab leaves without picking. A screen reader hears how many there are.
 * `suggest` is whatever finds places; this component knows nothing about who does.
 */
export function PlaceSearch({
  name,
  label,
  hint,
  error,
  suggest,
  onPick,
  onQueryChange,
  defaultValue = '',
  notFound,
  didYouMeanLabel,
  foundWords,
  credit,
}: Omit<FieldBase, 'width' | 'optional' | 'idScope'> & {
  /** Suggestions for what is typed; with nothing typed, what to offer before typing. */
  suggest: (query: string) => Promise<PlaceSuggestions>;
  onPick: (option: PlaceOption) => void;
  /** Told of every change to what is typed, so a picked place can be let go when it's cleared. */
  onQueryChange?: (query: string) => void;
  defaultValue?: string;
  /** Under the field when nothing matches (`near` false), or only near spellings do. */
  notFound: (typed: string, near: boolean) => ReactNode;
  /** The label of the group of near spellings: "Did you mean". */
  didYouMeanLabel: string;
  /** What a screen reader hears when suggestions arrive: "3 places found". */
  foundWords: (count: number) => string;
  /** The data's credit, as a link: shown under the suggestions. */
  credit?: { text: string; href: string };
}) {
  const ids = fieldIds(name);
  const listId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [answer, setAnswer] = useState<PlaceSuggestions | null>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  /** Only the newest answer is shown, whichever comes back first. */
  const latest = useRef(0);
  const answers = useRef(new Map<string, PlaceSuggestions>());

  const ask = useCallback(
    async (typed: string): Promise<PlaceSuggestions> => {
      // What to start from changes as places are picked, so it is asked for afresh each time.
      if (!typed) return suggest(typed);
      const kept = answers.current.get(typed);
      if (kept) return kept;
      const found = await suggest(typed);
      answers.current.set(typed, found);
      if (answers.current.size > KEEP_ANSWERS) {
        answers.current.delete(answers.current.keys().next().value!);
      }
      return found;
    },
    [suggest],
  );

  const typed = query.trim();
  // Before typing, and once a place has been picked, the list offers what to start from.
  const lookingUp = typed.length === 0 || typed.length >= SHORTEST;

  useEffect(() => {
    if (!open || !lookingUp) return;
    const mine = ++latest.current;
    const timer = setTimeout(
      () => {
        ask(typed).then(
          (found) => {
            if (mine !== latest.current) return;
            setAnswer(found);
            setActive(-1);
          },
          () => {
            if (mine === latest.current) setAnswer({ groups: [], didYouMean: false });
          },
        );
      },
      typed.length === 0 ? 0 : PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [open, lookingUp, typed, ask]);

  const groups = open && lookingUp && answer ? answer.groups : [];
  const shown = groups.flatMap((group) => group.options);
  const nothing = open && typed.length >= SHORTEST && answer !== null && shown.length === 0;
  const near = open && typed.length >= SHORTEST && answer?.didYouMean === true && shown.length > 0;

  function pick(option: PlaceOption) {
    setOpen(false);
    setQuery(option.label);
    onPick(option);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (shown.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((at) => (at + step + shown.length) % shown.length);
    } else if (event.key === 'Enter') {
      // Enter picks the suggestion in hand, never a half-typed place.
      event.preventDefault();
      const option = shown[active] ?? (shown.length === 1 ? shown[0] : undefined);
      if (option) pick(option);
    } else if (event.key === 'Escape') {
      if (shown.length > 0) {
        event.preventDefault();
        setOpen(false);
      } else if (query) {
        event.preventDefault();
        setQuery('');
        onQueryChange?.('');
      }
    }
  }

  // Each group's first option's place among them all, for the arrow keys.
  const starts = groups.map((_, g) =>
    groups.slice(0, g).reduce((count, group) => count + group.options.length, 0),
  );
  return (
    <FieldFrame name={name} label={label} hint={hint} error={error}>
      <div className={styles.search}>
        <Search className={styles.icon} size={20} strokeWidth={1.75} aria-hidden="true" />
        <input
          id={ids.input}
          name={name}
          type="text"
          role="combobox"
          className={`${controlClass} ${styles.input}`}
          value={query}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={60}
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(name, hint, error)}
          onChange={(event) => {
            setQuery(event.target.value);
            onQueryChange?.(event.target.value);
            setOpen(true);
            setAnswer(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      <p className={styles.status} role="status">
        {nothing || near ? (
          notFound(typed, near)
        ) : shown.length > 0 ? (
          <span className="visually-hidden">{foundWords(shown.length)}</span>
        ) : null}
      </p>
      <div className={styles.panel} hidden={shown.length === 0}>
        <ul id={listId} role="listbox" aria-labelledby={ids.label} className={styles.list}>
          {groups.map((group, g) => {
            const headingId = `${listId}-group-${g}`;
            const heading = near ? didYouMeanLabel : group.label;
            return (
              <li key={`${group.label}-${g}`} role="presentation" className={styles.group}>
                <span id={headingId} role="presentation" className={styles.groupLabel}>
                  {heading}
                </span>
                <ul role="group" aria-labelledby={headingId} className={styles.options}>
                  {group.options.map((option, i) => {
                    const at = starts[g]! + i;
                    const Icon = placeIcons[option.icon];
                    return (
                      <li
                        key={option.id}
                        id={`${listId}-${at}`}
                        role="option"
                        aria-selected={at === active}
                        className={styles.option}
                        // Before the field loses focus, so the press isn't lost as the list closes.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pick(option)}
                      >
                        <Icon
                          className={styles.optionIcon}
                          size={20}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span className={styles.words}>
                          <span className={styles.name}>{withTyped(option.name, typed)}</span>
                          {/* A screen reader hears the name, then where it is. */}{' '}
                          <span className={styles.description}>{option.description}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
        {credit ? (
          <p className={styles.credit}>
            <Link href={credit.href} onMouseDown={(event) => event.preventDefault()}>
              {credit.text}
            </Link>
          </p>
        ) : null}
      </div>
    </FieldFrame>
  );
}
