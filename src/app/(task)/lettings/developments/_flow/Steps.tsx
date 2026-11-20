'use client';

import type { z } from 'zod';
import { addLettingCopy } from '@/copy/add-letting';
import { developmentCopy } from '@/copy/developments';
import {
  developmentFactsSchema,
  developmentNameSchema,
  unitTypeRentSchema,
  unitTypeSchema,
} from '@/domain/developments/development';
import {
  berRatings,
  furnishing,
  parkingOptions,
  propertyTypes,
} from '@/domain/lettings/new-letting';
import { fieldErrors, type FormState } from '@/lib/forms';
import { Chips } from '@/ui/Chips';
import { SelectField, TextArea, TextField } from '@/ui/Field';
import { DateField } from '@/ui/Pickers';
import { StepForm, type StepFrame } from '../../_flow/StepForm';
import styles from './developments.module.css';

/**
 * BA-15: the screens of adding a development and a type of home in it, one question each, on
 * the same flow shell and fields as adding one home. Errors are at the fields.
 */

const copy = developmentCopy;
const homeCopy = addLettingCopy.home;

type Action = (state: FormState, data: FormData) => Promise<FormState>;

const problemsBy = (schema: () => z.ZodType) => (values: Record<string, string>) => {
  const parsed = schema().safeParse(values);
  return parsed.success ? {} : fieldErrors(parsed.error);
};

const options = (record: Record<string, string>) =>
  Object.entries(record).map(([value, label]) => ({ value, label }));

/** "What is the development called?" */
export function NameStep({
  frame,
  action,
  name,
  primary,
}: {
  frame: StepFrame;
  action: Action;
  name: string;
  primary?: string;
}) {
  return (
    <StepForm
      id="development-name"
      frame={frame}
      action={action}
      check={problemsBy(developmentNameSchema)}
      title={copy.name.title}
      lead={copy.name.lead}
      primary={primary}
    >
      {({ errors, values }) => (
        <TextField
          name="name"
          label={copy.name.label}
          autoComplete="off"
          defaultValue={values?.name ?? name}
          error={errors.name}
        />
      )}
    </StepForm>
  );
}

/** "What do the homes share?": parking and the development in the lister's words. */
export function FactsStep({
  frame,
  action,
  values: start,
}: {
  frame: StepFrame;
  action: Action;
  values: Record<string, string>;
}) {
  return (
    <StepForm
      id="development-facts"
      frame={frame}
      action={action}
      check={problemsBy(developmentFactsSchema)}
      title={copy.facts.title}
      lead={copy.facts.lead}
    >
      {({ errors, values }) => {
        const v = values ?? start;
        return (
          <>
            <Chips
              name="parking"
              legend={copy.facts.parking}
              optional
              options={options(parkingOptions)}
              defaultValue={v.parking}
              error={errors.parking}
            />
            <TextArea
              name="description"
              label={copy.facts.description}
              hint={copy.facts.descriptionHint}
              optional
              rows={5}
              defaultValue={v.description}
              error={errors.description}
            />
          </>
        );
      }}
    </StepForm>
  );
}

/** "What kind of home is this?": the type's name and rooms, as a home's are asked. */
export function TypeStep({
  frame,
  action,
  values: start,
}: {
  frame: StepFrame;
  action: Action;
  values: Record<string, string>;
}) {
  return (
    <StepForm
      id="unit-type"
      frame={frame}
      action={action}
      check={problemsBy(unitTypeSchema)}
      title={copy.type.title}
      lead={copy.type.lead}
    >
      {({ errors, values }) => {
        const v = values ?? start;
        return (
          <>
            <TextField
              name="name"
              label={copy.type.name}
              hint={copy.type.nameHint}
              autoComplete="off"
              defaultValue={v.name}
              error={errors.name}
            />
            <Chips
              name="propertyType"
              legend={homeCopy.type}
              options={options(propertyTypes)}
              defaultValue={v.propertyType}
              error={errors.propertyType}
            />
            <Chips
              name="bedrooms"
              legend={homeCopy.bedrooms}
              options={['0', '1', '2', '3', '4', '5'].map((count) => ({
                value: count,
                label: count === '0' ? homeCopy.studio : count,
              }))}
              defaultValue={v.bedrooms}
              error={errors.bedrooms}
            />
            <Chips
              name="bathrooms"
              legend={homeCopy.bathrooms}
              optional
              options={['1', '2', '3', '4'].map((count) => ({ value: count, label: count }))}
              defaultValue={v.bathrooms}
              error={errors.bathrooms}
            />
            <Chips
              name="furnished"
              legend={homeCopy.furnishing}
              optional
              options={options(furnishing)}
              defaultValue={v.furnished}
              error={errors.furnished}
            />
            <SelectField
              name="berRating"
              label={homeCopy.ber}
              optional
              width="medium"
              defaultValue={v.berRating ?? ''}
              error={errors.berRating}
              options={[
                { value: '', label: homeCopy.berChoose },
                ...berRatings.map((ber) => ({
                  value: ber,
                  label: ber === 'exempt' ? homeCopy.berExempt : ber,
                })),
              ]}
            />
            <TextField
              name="floorAreaSqm"
              label={copy.type.floorArea}
              optional
              width="short"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={v.floorAreaSqm}
              error={errors.floorAreaSqm}
            />
          </>
        );
      }}
    </StepForm>
  );
}

/** "Rent, and how many". */
export function TypeRentStep({
  frame,
  action,
  values: start,
}: {
  frame: StepFrame;
  action: Action;
  values: Record<string, string>;
}) {
  return (
    <StepForm
      id="unit-type-rent"
      frame={frame}
      action={action}
      check={problemsBy(unitTypeRentSchema)}
      title={copy.rent.title}
    >
      {({ errors, values }) => {
        const v = values ?? start;
        return (
          <>
            <TextField
              name="rent"
              label={copy.rent.rent}
              prefix="€"
              width="medium"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={v.rent}
              error={errors.rent}
            />
            <TextField
              name="count"
              label={copy.rent.count}
              hint={copy.rent.countHint}
              width="short"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={v.count}
              error={errors.count}
            />
          </>
        );
      }}
    </StepForm>
  );
}

/** One home on "Check the homes". */
export interface ReviewHome {
  id: string;
  addressLine1: string;
  line: string;
  /** Its rent check needs a look on its own page before it can go live. */
  needsLook: boolean;
}

/**
 * M35, "Check the homes": the type's homes being set up, in one list, and one button that puts
 * them live together. Each home's going live is the person's own decision, recorded on it.
 */
export function ReviewStep({
  frame,
  action,
  homes,
  lead,
}: {
  frame: StepFrame;
  action: Action;
  homes: readonly ReviewHome[];
  lead: string;
}) {
  const ready = homes.filter((home) => !home.needsLook).length;
  return (
    <StepForm
      id="unit-review"
      frame={frame}
      action={action}
      title={copy.review.title}
      lead={lead}
      primary={copy.review.putLive(ready)}
      pending={copy.review.putting}
    >
      {() => (
        <>
          <ul className={styles.homes} aria-label={copy.review.title}>
            {homes.map((home) => (
              <li key={home.id} className={styles.home}>
                <span className={styles.homeName}>{home.addressLine1}</span>
                <span className={styles.muted}>{home.line}</span>
                {home.needsLook ? <span>{copy.review.getAdvice}</span> : null}
              </li>
            ))}
          </ul>
          <p>{copy.review.afterLive}</p>
        </>
      )}
    </StepForm>
  );
}

/**
 * M35, "Which homes are they?": one row per home still to add, each its number or door, its
 * floor and the date it's free. The rest comes from the type and the development.
 */
export function HomesStep({
  frame,
  action,
  count,
  made,
  today,
  inAYear,
  start,
}: {
  frame: StepFrame;
  action: Action;
  /** How many rows to ask for: the homes of the type not added yet. */
  count: number;
  /** How many are added already. */
  made: number;
  today: string;
  inAYear: string;
  start: { availableFrom: string };
}) {
  return (
    <StepForm
      id="unit-homes"
      frame={frame}
      action={action}
      title={copy.homes.title}
      lead={made > 0 ? `${copy.homes.lead} ${copy.homes.already(made)}` : copy.homes.lead}
      primary={copy.homes.make(count)}
    >
      {({ errors, values }) => (
        <ol className={styles.rows}>
          {Array.from({ length: count }, (_, i) => {
            const n = made + i + 1;
            return (
              <li key={i} className={styles.row}>
                <TextField
                  name={`unit-${i}`}
                  label={copy.homes.unit(n)}
                  hint={i === 0 ? copy.homes.unitHint : undefined}
                  width="medium"
                  autoComplete="off"
                  defaultValue={values?.[`unit-${i}`] ?? ''}
                  error={errors[`unit-${i}`]}
                />
                <TextField
                  name={`floor-${i}`}
                  label={copy.homes.floor(n)}
                  hint={i === 0 ? copy.homes.floorHint : undefined}
                  optional
                  width="short"
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={values?.[`floor-${i}`] ?? ''}
                  error={errors[`floor-${i}`]}
                />
                <DateField
                  name={`availableFrom-${i}`}
                  label={copy.homes.availableFrom(n)}
                  min={today}
                  max={inAYear}
                  defaultValue={values?.[`availableFrom-${i}`] ?? start.availableFrom}
                  error={errors[`availableFrom-${i}`]}
                />
              </li>
            );
          })}
        </ol>
      )}
    </StepForm>
  );
}
