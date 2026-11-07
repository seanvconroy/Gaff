'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import styles from './search.module.css';

interface Suggestion {
  slug: string;
  name: string;
  description: string;
}

/**
 * M56: the place box, with suggestions as the renter types (the ARIA combobox pattern). Without
 * JavaScript it's a plain text box, and the search finds the best match for what was typed.
 */
export function PlaceSearch({
  defaultValue,
  defaultSlug,
}: {
  defaultValue: string;
  defaultSlug: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [slug, setSlug] = useState(defaultSlug);
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const typed = value.trim();
    if (!open || typed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(typed)}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const body = (await response.json()) as { places: Suggestion[] };
          setOptions(body.places);
          setActive(-1);
        }
      } catch {
        // A cancelled or failed lookup leaves the box as a plain text box.
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open]);

  const shown = open && value.trim().length >= 2 && options.length > 0;

  function choose(option: Suggestion) {
    setValue(option.name);
    setSlug(option.slug);
    setOpen(false);
    // The hidden slug must be in the form before it's sent.
    requestAnimationFrame(() => input.current?.form?.requestSubmit());
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === 'Enter' && shown && active >= 0) {
      event.preventDefault();
      choose(options[active]!);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className={styles.combo}>
      <label htmlFor={`${id}-where`} className={styles.label}>
        Where do you want to live?
      </label>
      <p id={`${id}-hint`} className={styles.hint}>
        A county, town, area or Dublin district, like Rathmines or D6
      </p>
      <input
        ref={input}
        id={`${id}-where`}
        name="where"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={`${id}-options`}
        aria-activedescendant={shown && active >= 0 ? `${id}-option-${active}` : undefined}
        aria-describedby={`${id}-hint`}
        autoComplete="off"
        spellCheck={false}
        className={styles.control}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setSlug('');
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      />
      <input type="hidden" name="place" value={slug} />
      <ul
        id={`${id}-options`}
        role="listbox"
        aria-label="Places"
        className={styles.options}
        hidden={!shown}
      >
        {options.map((option, i) => (
          <li
            key={option.slug}
            id={`${id}-option-${i}`}
            role="option"
            aria-selected={i === active}
            className={styles.option}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(option);
            }}
          >
            <span className={styles.optionName}>{option.name}</span>
            <span className={styles.optionMore}>{option.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
