'use client';

import { MapPin, Search } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import styles from './AddressSearch.module.css';
import { controlClass, describedBy, type FieldBase, FieldFrame, fieldIds } from './Field';

export interface AddressOption {
  id: string;
  label: string;
}

/** The fewest characters worth looking up, and how long to wait after the last one. */
const SHORTEST = 3;
const PAUSE_MS = 200;

/**
 * Address search (section 8): one field that takes an Eircode or a typed address, with the
 * results appearing under it as the person types (UX-LT-9). It is the pattern people know from
 * every checkout: type, pick one, done. On a phone the step it sits in is the whole screen, so
 * the field and its results fill it; on a desktop they sit in the task's column.
 *
 * It is a combobox: the arrows move through the results, Enter picks one, Escape closes them,
 * and a screen reader hears how many there are. `search` is whatever looks addresses up; this
 * component knows nothing about who does. Nothing typed is kept here after a result is picked.
 */
export function AddressSearch({
  name,
  label,
  hint,
  error,
  search,
  onPick,
  notFound,
  defaultValue = '',
  onQueryChange,
  foundWords = (count) => (count === 1 ? '1 address found' : `${count} addresses found`),
}: Omit<FieldBase, 'width' | 'optional'> & {
  search: (query: string) => Promise<AddressOption[]>;
  onPick: (option: AddressOption) => void;
  /** Under the field when nothing matches: what to do next, in a sentence. */
  notFound: ReactNode;
  defaultValue?: string;
  /** Told of every change to what is typed, so a picked value can be let go when it's cleared. */
  onQueryChange?: (query: string) => void;
  /** What a screen reader hears when results arrive: "3 places found". */
  foundWords?: (count: number) => string;
}) {
  const ids = fieldIds(name);
  const listId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [options, setOptions] = useState<AddressOption[] | null>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  /** Only the newest search's answer is shown, whichever comes back first. */
  const latest = useRef(0);

  useEffect(() => {
    const typed = query.trim();
    if (typed.length < SHORTEST) return;
    const mine = ++latest.current;
    const timer = setTimeout(() => {
      search(typed).then(
        (found) => {
          if (mine !== latest.current) return;
          setOptions(found);
          setActive(-1);
        },
        () => {
          if (mine === latest.current) setOptions([]);
        },
      );
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [query, search]);

  const typedEnough = query.trim().length >= SHORTEST;
  const shown = open && typedEnough ? (options ?? []) : [];
  const nothing = open && typedEnough && options !== null && options.length === 0;

  function pick(option: AddressOption) {
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
      // Enter picks the result in hand. It never sends the step with a half-typed address.
      event.preventDefault();
      const option = shown[active] ?? (shown.length === 1 ? shown[0] : undefined);
      if (option) pick(option);
    } else if (event.key === 'Escape' && shown.length > 0) {
      event.preventDefault();
      setOpen(false);
    }
  }

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
            if (event.target.value.trim().length < SHORTEST) setOptions(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-labelledby={ids.label}
        className={styles.list}
        hidden={shown.length === 0}
      >
        {shown.map((option, index) => (
          <li
            key={option.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            className={styles.option}
            // Before the field loses focus, so the press isn't lost as the list closes.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(option)}
          >
            <MapPin className={styles.pin} size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>{option.label}</span>
          </li>
        ))}
      </ul>
      <p className={styles.status} role="status">
        {nothing ? (
          notFound
        ) : shown.length > 0 ? (
          <span className="visually-hidden">{foundWords(shown.length)}</span>
        ) : null}
      </p>
    </FieldFrame>
  );
}
