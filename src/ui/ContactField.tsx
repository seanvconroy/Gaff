'use client';

import { ChevronDown } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import styles from './ContactField.module.css';
import { controlClass, describedBy, type FieldBase, FieldFrame, fieldIds } from './Field';

export interface DiallingOption {
  /** What the form sends: the country's ISO code. */
  value: string;
  /** In the list: "Ireland (+353)". */
  label: string;
  /** In the field: "+353". */
  short: string;
}

/**
 * One field for an email address or a mobile number (section 8, "Contact field", UX-SI-16). The
 * country code sits inside the field, at its start: one box, 48px high, as every control is. It
 * shows only while `showDialling` says what's typed needs one, so an email address, or a number
 * typed with its own plus, has the whole field.
 *
 * The code is a real select, so a phone opens its own list and a screen reader reads "Country
 * code". Closed, it shows the short form ("+353") drawn over it; the list shows the countries'
 * names.
 */
export function ContactField({
  dialling,
  showDialling,
  defaultValue = '',
  onChange,
  ...rest
}: Omit<FieldBase, 'width' | 'optional'> & {
  dialling: {
    name: string;
    label: string;
    options: readonly DiallingOption[];
    defaultValue: string;
  };
  /** Whether what's typed so far is a number that needs a country code. */
  showDialling: (typed: string) => boolean;
  defaultValue?: string;
} & Omit<
    ComponentProps<'input'>,
    'name' | 'id' | 'className' | 'style' | 'width' | 'defaultValue' | 'value'
  >) {
  const { name, idScope, label, hint, error, ...input } = rest;
  const [typed, setTyped] = useState(defaultValue);
  const [country, setCountry] = useState(dialling.defaultValue);
  const withCode = showDialling(typed);
  const short = dialling.options.find((option) => option.value === country)?.short ?? '';
  return (
    <FieldFrame name={name} idScope={idScope} label={label} hint={hint} error={error}>
      <div className={withCode ? styles.withCode : undefined}>
        {withCode ? (
          <span className={styles.dialling}>
            <select
              name={dialling.name}
              aria-label={dialling.label}
              autoComplete="tel-country-code"
              className={styles.select}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              {dialling.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className={styles.shown} aria-hidden="true">
              {short}
              <ChevronDown size={16} strokeWidth={1.75} />
            </span>
          </span>
        ) : null}
        <input
          {...input}
          id={fieldIds(name, idScope).input}
          name={name}
          className={controlClass}
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(name, hint, error, idScope)}
          onChange={(event) => {
            setTyped(event.target.value);
            onChange?.(event);
          }}
        />
      </div>
    </FieldFrame>
  );
}
