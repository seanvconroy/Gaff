'use client';

import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { buttonProps } from './Button';
import { controlClass } from './Field';
import { placeIcons, type PlaceOption, type PlaceSuggestions, withTyped } from './PlaceSearch';
import styles from './SearchBar.module.css';

/** The fewest characters of a place worth looking up, and how long to wait after the last one. */
const SHORTEST = 2;
const PAUSE_MS = 120;
/** Answers kept, so deleting a letter is instant. */
const KEEP_ANSWERS = 20;

export interface SearchBarWords {
  /** Said at the top of the list before anything is typed: what the box takes. */
  tip: string;
  /** The row that searches for what was typed as a sentence: "Search for". */
  searchFor: string;
  /** The label of the group of near spellings: "Did you mean". */
  didYouMean: string;
  /** What a screen reader hears when suggestions arrive: "3 suggestions". */
  found: (count: number) => string;
  /** Under the list when nothing matches a place that was typed. */
  notFound: (typed: string) => string;
  clear: string;
}

/**
 * The search bar (section 8, "Search bar"; UX-SR-3, UX-SR-14): the one box search starts from.
 * It takes a place, a road, an Eircode area or a sentence, and helps with each as it's typed:
 *
 * - the part that could be a place is looked up, and the places, streets and landmarks it could
 *   be are offered under the box (picking one searches there, with whatever else was typed);
 * - whatever else Gaff reads in the words (bedrooms, the most rent, pets) is shown as it is
 *   understood, so a renter can see that a sentence works;
 * - Enter, or Search, sends the words as they are.
 *
 * It is a combobox: ↓ and ↑ move through the list, Enter picks, Escape closes it and then clears
 * the box. The list floats over the page, so nothing under the box moves. `suggest`, `placeIn`
 * and `reads` are the page's: this component knows nothing about who finds places or how a
 * sentence is read. What is typed goes only to `action`, never into the page's address.
 */
export function SearchBar({
  labelledBy,
  placeholder,
  submitLabel,
  action,
  primary = true,
  hidden = {},
  suggest,
  placeIn,
  reads,
  onPick,
  words,
  credit,
}: {
  /** The id of the heading or label that names the search. */
  labelledBy: string;
  placeholder: string;
  submitLabel: string;
  action: (formData: FormData) => void | Promise<void>;
  /** The Search button is the view's one primary button, unless something else is (UX-DS-2). */
  primary?: boolean;
  /** Settings carried with the words, such as `rent=1`. */
  hidden?: Record<string, string>;
  /** Places for the part of the words that could be one; with '', what to offer before typing. */
  suggest: (query: string) => Promise<PlaceSuggestions>;
  /** The part of what's typed that could be a place, or null when none of it could. */
  placeIn: (typed: string) => string | null;
  /** What else Gaff reads in what's typed, in words: ["2 bedrooms", "Up to €2,000 a month"]. */
  reads: (typed: string) => string[];
  /** A place was picked from the list. */
  onPick?: (option: PlaceOption) => void;
  words: SearchBarWords;
  /** The place data's credit, as a link at the foot of the list. */
  credit?: { text: string; href: string };
}) {
  const listId = useId();
  const form = useRef<HTMLFormElement>(null);
  const place = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [answer, setAnswer] = useState<{ for: string; found: PlaceSuggestions } | null>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  /** Only the newest answer is shown, whichever comes back first. */
  const latest = useRef(0);
  const answers = useRef(new Map<string, PlaceSuggestions>());

  const text = typed.trim();
  const fragment = text ? placeIn(typed) : '';
  /** What is asked of the place index: nothing typed, or the part that could be a place. */
  const query =
    fragment !== null && (fragment === '' || fragment.length >= SHORTEST) ? fragment : null;
  const understood = text ? reads(typed) : [];

  const ask = useCallback(
    async (asked: string): Promise<PlaceSuggestions> => {
      // What to start from changes as places are picked, so it is asked for afresh each time.
      if (!asked) return suggest(asked);
      const kept = answers.current.get(asked);
      if (kept) return kept;
      const found = await suggest(asked);
      answers.current.set(asked, found);
      if (answers.current.size > KEEP_ANSWERS) {
        answers.current.delete(answers.current.keys().next().value!);
      }
      return found;
    },
    [suggest],
  );

  useEffect(() => {
    if (!open || query === null) return;
    const mine = ++latest.current;
    const timer = setTimeout(
      () => {
        ask(query).then(
          (found) => {
            if (mine === latest.current) setAnswer({ for: query, found });
          },
          () => {
            if (mine === latest.current) {
              setAnswer({ for: query, found: { groups: [], didYouMean: false } });
            }
          },
        );
      },
      query === '' ? 0 : PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [open, query, ask]);

  const current = open && query !== null && answer?.for === query ? answer.found : null;
  const groups = current?.groups ?? [];
  const options = groups.flatMap((group) => group.options);
  const near = current?.didYouMean === true && options.length > 0;
  /** The first row, when the words say more than a place: it searches for them as they are. */
  const sentence = open && understood.length > 0;
  const rows = (sentence ? 1 : 0) + options.length;
  const nothing = open && Boolean(query) && current !== null && options.length === 0 && !sentence;
  const showTip = open && text === '';
  const shown = open && (rows > 0 || showTip || nothing);

  function send(option?: PlaceOption) {
    if (place.current) place.current.value = option?.id ?? '';
    if (option) onPick?.(option);
    setOpen(false);
    form.current?.requestSubmit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) setOpen(true);
      if (rows === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((at) => (at < 0 && step < 0 ? rows - 1 : (at + step + rows) % rows));
    } else if (event.key === 'Enter') {
      // Enter picks the row in hand; with none in hand, it sends the words as they are.
      if (active < 0) return;
      event.preventDefault();
      send(sentence ? (active === 0 ? undefined : options[active - 1]) : options[active]);
    } else if (event.key === 'Escape') {
      if (shown) {
        event.preventDefault();
        setOpen(false);
      } else if (typed) {
        event.preventDefault();
        setTyped('');
      }
    }
  }

  // Each group's first option's place among every row, for the arrow keys.
  const starts = groups.map(
    (_, g) =>
      (sentence ? 1 : 0) +
      groups.slice(0, g).reduce((count, group) => count + group.options.length, 0),
  );
  return (
    <form
      ref={form}
      action={action}
      role="search"
      aria-labelledby={labelledBy}
      className={styles.form}
    >
      <div className={styles.field}>
        <Search className={styles.icon} size={20} strokeWidth={1.75} aria-hidden="true" />
        <input
          name="words"
          type="text"
          role="combobox"
          aria-labelledby={labelledBy}
          className={`${controlClass} ${styles.input}`}
          placeholder={placeholder}
          value={typed}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={500}
          aria-expanded={rows > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            setTyped(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {typed ? (
          <button
            type="button"
            className={styles.clear}
            aria-label={words.clear}
            // Before the field loses focus, so the list doesn't close and reopen.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setTyped('');
              setActive(-1);
            }}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        <div className={styles.panel} hidden={!shown}>
          {showTip ? <p className={styles.tip}>{words.tip}</p> : null}
          <ul id={listId} role="listbox" aria-labelledby={labelledBy} className={styles.list}>
            {sentence ? (
              <li
                id={`${listId}-0`}
                role="option"
                aria-selected={active === 0}
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => send()}
              >
                <Search
                  className={styles.optionIcon}
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className={styles.words}>
                  <span className={styles.description}>{words.searchFor}</span>{' '}
                  <span className={styles.name}>{understood.join(' · ')}</span>
                </span>
              </li>
            ) : null}
            {groups.map((group, g) => {
              const headingId = `${listId}-group-${g}`;
              return (
                <li key={`${group.label}-${g}`} role="presentation" className={styles.group}>
                  <span id={headingId} role="presentation" className={styles.groupLabel}>
                    {near ? words.didYouMean : group.label}
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
                          onClick={() => send(option)}
                        >
                          <Icon
                            className={styles.optionIcon}
                            size={20}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          <span className={styles.words}>
                            <span className={styles.name}>
                              {withTyped(option.name, query ?? '')}
                            </span>{' '}
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
          {nothing ? <p className={styles.tip}>{words.notFound(query ?? '')}</p> : null}
          {credit && options.length > 0 ? (
            <p className={styles.credit}>
              <Link href={credit.href} onMouseDown={(event) => event.preventDefault()}>
                {credit.text}
              </Link>
            </p>
          ) : null}
        </div>
      </div>
      <button type="submit" {...buttonProps(primary ? 'primary' : 'secondary')}>
        {submitLabel}
      </button>
      <input ref={place} type="hidden" name="place" defaultValue="" />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p className="visually-hidden" role="status">
        {open && rows > 0 ? words.found(rows) : ''}
      </p>
    </form>
  );
}
