'use client';

import { useActionState } from 'react';
import {
  berRatings,
  counties,
  furnishing,
  parkingOptions,
  propertyTypes,
} from '@/domain/lettings/new-letting';
import { emptyFormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { SelectField, TextArea, TextField } from '@/ui/Field';
import { Columns, FormActions, FormSection, formClass } from '@/ui/Form';
import { Notice } from '@/ui/Notice';
import { SubmitButton } from '@/ui/SubmitButton';
import { createLettingAction } from './actions';

const choose = { value: '', label: 'Choose…' };
const options = (record: Record<string, string>) =>
  Object.entries(record).map(([value, label]) => ({ value, label }));

export function NewLettingForm({
  forAgency,
  today,
  development,
}: {
  forAgency: boolean;
  today: string;
  /** M33: a home in a development starts with the development's address. */
  development?: { id: string; name: string; addressLine1: string; area: string; county: string };
}) {
  const [state, action] = useActionState(createLettingAction, emptyFormState);
  const v =
    state.values ??
    (development
      ? {
          addressLine1: `, ${development.addressLine1}`,
          area: development.area,
          county: development.county,
        }
      : {});
  const e = state.errors ?? {};
  return (
    <form key={state.attempt ?? 'first'} action={action} className={formClass} noValidate>
      {development ? <input type="hidden" name="developmentId" value={development.id} /> : null}
      {state.message ? (
        <Notice tone="danger" title="That didn’t save yet" role="alert">
          <p>{state.message}</p>
        </Notice>
      ) : null}

      <FormSection id="home" title="The home">
        <TextField
          name="addressLine1"
          label="Address"
          hint="The first line, like 12 Ranelagh Road. Renters see this."
          autoComplete="address-line1"
          defaultValue={v.addressLine1}
          error={e.addressLine1}
        />
        <TextField
          name="addressLine2"
          label="Address line 2"
          optional
          autoComplete="address-line2"
          defaultValue={v.addressLine2}
          error={e.addressLine2}
        />
        <Columns three>
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
          <TextField
            name="eircode"
            label="Eircode"
            optional
            autoComplete="postal-code"
            defaultValue={v.eircode}
            error={e.eircode}
          />
        </Columns>
      </FormSection>

      <FormSection id="rent" title="Rent and availability">
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
      </FormSection>

      <FormSection
        id="facts"
        title="Key facts"
        lead="Gaff answers renters’ questions from these facts, and nothing else."
      >
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
        <TextArea
          name="otherFacts"
          label="Anything else renters often ask?"
          optional
          hint="One fact per line, like “Gas central heating” or “Bins collected on Tuesdays”. Describe the home, not who should live there."
          rows={5}
          defaultValue={v.otherFacts}
          error={e.otherFacts}
        />
      </FormSection>

      <FormSection
        id="links"
        title="Photos and adverts"
        lead="Gaff uses the advert links to match each enquiry to this home."
      >
        <TextField
          name="photosUrl"
          label="Link to the photos"
          optional
          type="url"
          inputMode="url"
          defaultValue={v.photosUrl}
          error={e.photosUrl}
        />
        <Columns>
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
        </Columns>
      </FormSection>

      {forAgency ? (
        <FormSection
          id="landlord"
          title="Landlord"
          lead="If you’re letting this home for its owner, they can follow the letting and approve the tenant."
        >
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
        </FormSection>
      ) : null}

      <FormActions>
        <SubmitButton pendingLabel="Saving…">Save and add viewing times</SubmitButton>
        <ButtonLink href="/" variant="quiet">
          Cancel
        </ButtonLink>
      </FormActions>
    </form>
  );
}
