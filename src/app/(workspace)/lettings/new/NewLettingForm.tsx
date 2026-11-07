'use client';

import { Plus } from 'lucide-react';
import { type ReactNode, type Ref, useActionState, useRef, useState } from 'react';
import {
  berRatings,
  counties,
  furnishing,
  newLettingSchema,
  parkingOptions,
  propertyTypes,
} from '@/domain/lettings/new-letting';
import { emptyFormState, fieldErrors, formValues, type FormState } from '@/lib/forms';
import { Button, ButtonLink } from '@/ui/Button';
import { SelectField, TextArea, TextField } from '@/ui/Field';
import { Columns, FormActions, FormPanel, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { StepIndicator } from '@/ui/Steps';
import { SubmitButton } from '@/ui/SubmitButton';
import { createLettingAction } from './actions';
import styles from './new-letting.module.css';

const choose = { value: '', label: 'Choose…' };
const options = (record: Record<string, string>) =>
  Object.entries(record).map(([value, label]) => ({ value, label }));

/** The three steps, and the fields each one asks for. */
const stepFields = [
  ['addressLine1', 'addressLine2', 'area', 'county', 'eircode', 'rent', 'availableFrom'],
  ['propertyType', 'bedrooms', 'bathrooms', 'furnished', 'berRating', 'parking', 'otherFacts'],
  ['daftUrl', 'myhomeUrl', 'photosUrl', 'landlordName', 'landlordEmail'],
] as const;

const NEEDS_ANOTHER_LOOK = 'Some details need another look. They’re marked below.';

function firstStepWithError(errors: Record<string, string>): number | null {
  const index = stepFields.findIndex((fields) => fields.some((field) => errors[field]));
  return index === -1 ? null : index;
}

/**
 * R1, in three short steps instead of one long form (progressive disclosure): the home, its key
 * facts, then the optional advert links and landlord. Each step is checked with the same rules
 * the server uses before moving on; anything the server still finds sends you back to that step.
 */
export function NewLettingForm({ forAgency, today }: { forAgency: boolean; today: string }) {
  const [state, action] = useActionState(createLettingAction, emptyFormState);
  // After a failed save the form remounts with what was typed (selects included).
  return (
    <Wizard
      key={state.attempt ?? 'first'}
      state={state}
      action={action}
      forAgency={forAgency}
      today={today}
    />
  );
}

function Wizard({
  state,
  action,
  forAgency,
  today,
}: {
  state: FormState;
  action: (formData: FormData) => void;
  forAgency: boolean;
  today: string;
}) {
  const v = state.values ?? {};
  const titles = ['The home', 'Key facts', forAgency ? 'Adverts and landlord' : 'Adverts'];
  const last = titles.length - 1;
  const [step, setStep] = useState(() => firstStepWithError(state.errors ?? {}) ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>(state.errors ?? {});
  const [showLine2, setShowLine2] = useState(Boolean(v.addressLine2 || state.errors?.addressLine2));
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const e = errors;

  /** The current step's problems, by the same rules as the server. */
  function problemsIn(index: number): Record<string, string> {
    const parsed = newLettingSchema().safeParse(formValues(new FormData(form.current!)));
    if (parsed.success) return {};
    const fields: readonly string[] = stepFields[index]!;
    return Object.fromEntries(
      Object.entries(fieldErrors(parsed.error)).filter(([field]) => fields.includes(field)),
    );
  }

  function goTo(index: number) {
    setErrors({});
    setStep(index);
    window.scrollTo({ top: 0 });
    // Screen readers hear the new step's title; the next Tab goes to its first field.
    requestAnimationFrame(() => heading.current?.focus());
  }

  /** Continue if this step is complete; otherwise show what's wrong and go to the first one. */
  function next(): boolean {
    const problems = problemsIn(step);
    if (Object.keys(problems).length === 0) return true;
    setErrors(problems);
    requestAnimationFrame(() => {
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
    return false;
  }

  const anyErrors = Object.keys(errors).length > 0;
  return (
    <form
      ref={form}
      action={action}
      className={formClass}
      noValidate
      onChange={(event) => {
        // A field's error goes as soon as it's edited; the step is checked again on Continue.
        const name = (event.target as unknown as HTMLInputElement).name;
        if (name && errors[name]) {
          setErrors(({ [name]: _fixed, ...rest }) => rest);
        }
      }}
      onSubmit={(event) => {
        // Pressing Enter on a step before the last moves on, rather than saving half a letting.
        if (step < last) {
          event.preventDefault();
          if (next()) goTo(step + 1);
        } else if (!next()) {
          event.preventDefault();
        }
      }}
    >
      <StepIndicator steps={titles} current={step} onSelect={goTo} />

      {anyErrors || state.message ? (
        <Notice tone="danger" title="That didn’t save yet" role="alert">
          <p>{state.message && !anyErrors ? state.message : NEEDS_ANOTHER_LOOK}</p>
        </Notice>
      ) : null}

      <div hidden={step !== 0} className={styles.step}>
        <FormPanel>
          <section className={styles.section} aria-labelledby="step-home">
            <StepHeading id="step-home" current={step === 0} ref={step === 0 ? heading : null}>
              The home
            </StepHeading>
            <TextField
              name="addressLine1"
              label="Address"
              hint="The first line, like 12 Ranelagh Road. Renters see this."
              autoComplete="address-line1"
              defaultValue={v.addressLine1}
              error={e.addressLine1}
            />
            <div hidden={!showLine2}>
              <TextField
                name="addressLine2"
                label="Address line 2"
                optional
                autoComplete="address-line2"
                defaultValue={v.addressLine2}
                error={e.addressLine2}
              />
            </div>
            {!showLine2 ? (
              <div>
                <button
                  type="button"
                  className={styles.reveal}
                  onClick={() => {
                    setShowLine2(true);
                    requestAnimationFrame(() =>
                      form.current?.querySelector<HTMLElement>('[name="addressLine2"]')?.focus(),
                    );
                  }}
                >
                  <Plus size={18} strokeWidth={2} aria-hidden="true" />
                  Add a second address line
                </button>
              </div>
            ) : null}
            <Columns>
              <TextField
                name="area"
                label="Area"
                hint="Like Ranelagh, Dublin 6"
                defaultValue={v.area}
                error={e.area}
              />
              <SelectField
                name="county"
                label="County"
                defaultValue={v.county ?? 'Dublin'}
                error={e.county}
                options={counties.map((county) => ({ value: county, label: county }))}
              />
            </Columns>
            <TextField
              name="eircode"
              label="Eircode"
              optional
              width="short"
              autoComplete="postal-code"
              defaultValue={v.eircode}
              error={e.eircode}
            />
          </section>
          <section className={styles.section} aria-labelledby="step-rent">
            <h3 id="step-rent" className="type-title">
              Rent and availability
            </h3>
            <Columns>
              <TextField
                name="rent"
                label="Rent a month"
                prefix="€"
                inputMode="decimal"
                hint="As advertised"
                defaultValue={v.rent}
                error={e.rent}
              />
              <TextField
                name="availableFrom"
                label="Available from"
                type="date"
                min={today}
                defaultValue={v.availableFrom}
                error={e.availableFrom}
              />
            </Columns>
          </section>
        </FormPanel>
      </div>

      <div hidden={step !== 1} className={styles.step}>
        <FormPanel>
          <section className={styles.section} aria-labelledby="step-facts">
            <div className={styles.sectionHeader}>
              <StepHeading id="step-facts" current={step === 1} ref={step === 1 ? heading : null}>
                Key facts
              </StepHeading>
              <p className={styles.lead}>
                Gaff answers renters’ questions from these facts, and nothing else.
              </p>
            </div>
            <Columns three>
              <SelectField
                name="propertyType"
                label="Type of home"
                defaultValue={v.propertyType ?? ''}
                error={e.propertyType}
                options={[choose, ...options(propertyTypes)]}
              />
              <TextField
                name="bedrooms"
                label="Bedrooms"
                hint="0 for a studio"
                inputMode="numeric"
                defaultValue={v.bedrooms}
                error={e.bedrooms}
              />
              <TextField
                name="bathrooms"
                label="Bathrooms"
                inputMode="numeric"
                defaultValue={v.bathrooms}
                error={e.bathrooms}
              />
            </Columns>
            <Columns three>
              <SelectField
                name="furnished"
                label="Furnishing"
                defaultValue={v.furnished ?? ''}
                error={e.furnished}
                options={[choose, ...options(furnishing)]}
              />
              <SelectField
                name="berRating"
                label="BER rating"
                defaultValue={v.berRating ?? ''}
                error={e.berRating}
                options={[
                  choose,
                  ...berRatings.map((ber) => ({
                    value: ber,
                    label: ber === 'exempt' ? 'Exempt' : ber,
                  })),
                ]}
              />
              <SelectField
                name="parking"
                label="Parking"
                optional
                defaultValue={v.parking ?? ''}
                error={e.parking}
                options={[{ value: '', label: 'Not stated' }, ...options(parkingOptions)]}
              />
            </Columns>
          </section>
          <section className={styles.section} aria-labelledby="step-other">
            <h3 id="step-other" className="type-title">
              Anything else
            </h3>
            <TextArea
              name="otherFacts"
              label="Anything else renters often ask?"
              optional
              hint="One fact per line, like “Gas central heating” or “Bins collected on Tuesdays”. Describe the home, not who should live there."
              rows={5}
              defaultValue={v.otherFacts}
              error={e.otherFacts}
            />
          </section>
        </FormPanel>
      </div>

      <div hidden={step !== 2} className={styles.step}>
        <FormPanel>
          <section className={styles.section} aria-labelledby="step-adverts">
            <div className={styles.sectionHeader}>
              <StepHeading id="step-adverts" current={step === 2} ref={step === 2 ? heading : null}>
                Adverts
              </StepHeading>
              <p className={styles.lead}>
                Optional, but they help: Gaff uses the advert links to match each enquiry to this
                home.
              </p>
            </div>
            <TextField
              name="daftUrl"
              label="Daft advert"
              optional
              type="url"
              inputMode="url"
              defaultValue={v.daftUrl}
              error={e.daftUrl}
            />
            <TextField
              name="myhomeUrl"
              label="MyHome advert"
              optional
              type="url"
              inputMode="url"
              defaultValue={v.myhomeUrl}
              error={e.myhomeUrl}
            />
            <TextField
              name="photosUrl"
              label="Link to the photos"
              optional
              type="url"
              inputMode="url"
              defaultValue={v.photosUrl}
              error={e.photosUrl}
            />
          </section>
          {forAgency ? (
            <section className={styles.section} aria-labelledby="step-landlord">
              <div className={styles.sectionHeader}>
                <h3 id="step-landlord" className="type-title">
                  Landlord
                </h3>
                <p className={styles.lead}>
                  If you’re letting this home for its owner, they can follow the letting and approve
                  the tenant.
                </p>
              </div>
              <Columns>
                <TextField
                  name="landlordName"
                  label="Landlord’s name"
                  optional
                  autoComplete="off"
                  defaultValue={v.landlordName}
                  error={e.landlordName}
                />
                <TextField
                  name="landlordEmail"
                  label="Landlord’s email"
                  optional
                  type="email"
                  autoComplete="off"
                  defaultValue={v.landlordEmail}
                  error={e.landlordEmail}
                />
              </Columns>
            </section>
          ) : null}
        </FormPanel>
      </div>

      <FormActions>
        {step < last ? (
          <Button
            variant="primary"
            onClick={() => {
              if (next()) goTo(step + 1);
            }}
          >
            Continue
          </Button>
        ) : (
          <SubmitButton pendingLabel="Saving…">Save and add viewing times</SubmitButton>
        )}
        {step > 0 ? (
          <Button variant="quiet" onClick={() => goTo(step - 1)}>
            Back
          </Button>
        ) : (
          <ButtonLink href="/" variant="quiet">
            Cancel
          </ButtonLink>
        )}
      </FormActions>
    </form>
  );
}

/** A step's title: focused when the step opens, so screen readers hear where they are. */
function StepHeading({
  id,
  current,
  ref,
  children,
}: {
  id: string;
  current: boolean;
  ref: Ref<HTMLHeadingElement> | null;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      ref={ref}
      tabIndex={current ? -1 : undefined}
      className={`type-title ${styles.heading}`}
    >
      {children}
    </h2>
  );
}
