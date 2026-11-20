'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { addLettingCopy } from '@/copy/add-letting';
import {
  MAX_OCCUPANTS_LIMIT,
  describeStay,
  lettingDetailsFormSchema,
  lettingDetailsLine,
  minimumStays,
} from '@/domain/criteria/criteria';
import {
  berRatings,
  counties,
  furnishing,
  parkingOptions,
  propertyTypes,
} from '@/domain/lettings/new-letting';
import { descriptionDraftFields } from '@/domain/lettings/drafted-description';
import type { PostalAddress } from '@/ports/address-search';
import { AddressSearch } from '@/ui/AddressSearch';
import { Button } from '@/ui/Button';
import { Chips } from '@/ui/Chips';
import { Disclosure } from '@/ui/Disclosure';
import { SelectField, TextArea, TextField } from '@/ui/Field';
import { OptionRow } from '@/ui/OptionRow';
import { DraftedByAi } from '@/ui/StatusPill';
import { DateField } from '@/ui/Pickers';
import { draftDescriptionAction, lookUpAddressAction, suggestAddressesAction } from './actions';
import styles from './flow.module.css';

const copy = addLettingCopy;

/**
 * The fields of adding a letting, a group at a time. A step shows one group; the review
 * screen's sheets show the same groups (UX-LT-4), so a value is asked for, and checked, the
 * same way wherever it is changed.
 */
export interface GroupProps {
  /** What the fields start with: what's known, or what was typed before the step came back. */
  values: Record<string, string>;
  errors: Record<string, string>;
}

const options = (record: Record<string, string>) =>
  Object.entries(record).map(([value, label]) => ({ value, label }));
const numbered = (from: number, to: number, chosen: string) => {
  const list = Array.from({ length: to - from + 1 }, (_, index) => String(from + index));
  // A number beyond the chips (from an import, say) is still shown as chosen.
  return chosen && !list.includes(chosen) ? [...list, chosen] : list;
};

/**
 * Step 3, "Where is it?" (UX-LT-9): one search field for an Eircode or an address; picking a
 * result fills the full address. "Enter it myself" opens the same fields empty. Where no lookup
 * is connected, the fields are simply there.
 */
export function AddressFields({ values, errors, searchOn }: GroupProps & { searchOn: boolean }) {
  const hasAddress = Boolean(values.addressLine1 || values.area || values.eircode);
  const hasProblem = ['addressLine1', 'addressLine2', 'area', 'county', 'eircode'].some(
    (field) => errors[field],
  );
  const [open, setOpen] = useState(!searchOn || hasAddress || hasProblem);
  const [picked, setPicked] = useState<{ at: number; address: PostalAddress } | null>(null);
  const search = useCallback((query: string) => suggestAddressesAction(query), []);
  const start = picked
    ? {
        addressLine1: picked.address.addressLine1,
        addressLine2: picked.address.addressLine2 ?? '',
        area: picked.address.area,
        county: picked.address.county,
        eircode: picked.address.eircode ?? '',
      }
    : values;

  return (
    <>
      {searchOn ? (
        <AddressSearch
          name="addressSearch"
          label={copy.address.search}
          search={search}
          notFound={copy.address.notFound}
          error={errors.addressSearch}
          onPick={(option) => {
            void lookUpAddressAction(option.id).then((address) => {
              if (!address) return;
              setPicked({ at: Date.now(), address });
              setOpen(true);
            });
          }}
        />
      ) : null}
      {open ? (
        // Picking another address fills the fields afresh.
        <div key={picked?.at ?? 'typed'} className={styles.fields}>
          <TextField
            name="addressLine1"
            label={copy.address.line1}
            autoComplete="off"
            defaultValue={start.addressLine1}
            error={errors.addressLine1}
          />
          <TextField
            name="addressLine2"
            label={copy.address.line2}
            optional
            autoComplete="off"
            defaultValue={start.addressLine2}
            error={errors.addressLine2}
          />
          <TextField
            name="area"
            label={copy.address.area}
            hint={copy.address.areaHint}
            autoComplete="off"
            defaultValue={start.area}
            error={errors.area}
          />
          <SelectField
            name="county"
            label={copy.address.county}
            width="medium"
            defaultValue={start.county ?? ''}
            error={errors.county}
            options={[
              { value: '', label: 'Choose…' },
              ...counties.map((county) => ({ value: county, label: county })),
            ]}
          />
          <TextField
            name="eircode"
            label={copy.address.eircode}
            optional
            width="short"
            autoComplete="off"
            autoCapitalize="characters"
            defaultValue={start.eircode}
            error={errors.eircode}
          />
        </div>
      ) : (
        <div>
          <Button variant="quiet" onClick={() => setOpen(true)}>
            {copy.address.manual}
          </Button>
        </div>
      )}
    </>
  );
}

/** Step 4, "Rent and date". */
export function RentFields({
  values,
  errors,
  today,
  inAYear,
}: GroupProps & { today: string; inAYear: string }) {
  return (
    <>
      <TextField
        name="rent"
        label={copy.rent.rent}
        prefix="€"
        width="medium"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={values.rent}
        error={errors.rent}
      />
      <DateField
        name="availableFrom"
        label={copy.rent.availableFrom}
        min={today}
        max={inAYear}
        defaultValue={
          values.availableFrom && values.availableFrom >= today ? values.availableFrom : ''
        }
        error={errors.availableFrom}
      />
    </>
  );
}

/**
 * P10, P11: "Draft a description" is offered for this home. `byAi`: the saved description is
 * the AI's draft, unchanged.
 */
export interface DescriptionDrafting {
  homeId: string;
  byAi: boolean;
}

/**
 * The description, and where it's offered, "Draft a description" beside it: a quiet action,
 * never the screen's primary button (P10). The draft goes into the field to be read and
 * changed; nothing is saved until the lister saves. While the words are the draft's, they
 * carry "Drafted by AI", and the save hands back Gaff's mark so the server knows (P11).
 */
function DescriptionField({
  values,
  errors,
  drafting,
}: GroupProps & { drafting?: DescriptionDrafting }) {
  const words = copy.home.drafting;
  const [text, setText] = useState(values.description ?? '');
  // The draft Gaff gave, and its mark: from this visit, from a save that came back, or saved.
  const [draft, setDraft] = useState<{ text: string; mark: string } | null>(() =>
    values.descriptionMark
      ? { text: values.description ?? '', mark: values.descriptionMark }
      : drafting?.byAi && values.description
        ? { text: values.description, mark: '' }
        : null,
  );
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fromAi = draft !== null && draft.text.trim() === text.trim() && text.trim() !== '';
  // What the draft is, said while the words are still the draft's.
  const shown = note === words.drafted && !fromAi ? null : note;

  async function draftOne(form: HTMLFormElement | null) {
    if (!drafting) return;
    setNote(null);
    setBusy(true);
    const data = form ? new FormData(form) : new FormData();
    const typed = Object.fromEntries(
      descriptionDraftFields.flatMap((field) => {
        const value = data.get(field);
        return typeof value === 'string' ? [[field, value]] : [];
      }),
    );
    try {
      const result = await draftDescriptionAction(drafting.homeId, typed);
      if (result.ok) {
        setText(result.description);
        setDraft({ text: result.description, mark: result.mark });
        setNote(words.drafted);
      } else {
        setNote(result.message);
      }
    } catch {
      setNote(words.unavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.aside}>
      <TextArea
        name="description"
        label={copy.home.description}
        hint={copy.home.descriptionHint}
        optional
        rows={drafting ? 8 : 5}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        error={errors.description}
      />
      {fromAi && draft?.mark ? (
        <input type="hidden" name="descriptionMark" value={draft.mark} />
      ) : null}
      {drafting ? (
        <div className={styles.drafting}>
          {fromAi ? <DraftedByAi /> : null}
          <Button
            variant="quiet"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={(event) => void draftOne(event.currentTarget.form)}
          >
            {busy ? words.busy : text.trim() ? words.again : words.draft}
          </Button>
        </div>
      ) : null}
      {shown ? (
        <p className={styles.draftNote} role="status">
          {shown}
        </p>
      ) : null}
    </div>
  );
}

/** The home in the lister's own words. Both are checked for wording about who should apply. */
export function DescriptionFields({
  values,
  errors,
  drafting,
}: GroupProps & { drafting?: DescriptionDrafting }) {
  return (
    <>
      <DescriptionField values={values} errors={errors} drafting={drafting} />
      <TextArea
        name="otherFacts"
        label={copy.home.facts}
        hint={copy.home.factsHint}
        optional
        rows={4}
        defaultValue={values.otherFacts}
        error={errors.otherFacts}
      />
    </>
  );
}

/**
 * Step 5, "The home": type and bedrooms as taps; bathrooms, furnishing, the BER and parking
 * offered, not required (UX-LT-14).
 */
export function HomeFields({ values, errors }: GroupProps) {
  return (
    <>
      <Chips
        name="propertyType"
        legend={copy.home.type}
        options={options(propertyTypes)}
        defaultValue={values.propertyType}
        error={errors.propertyType}
      />
      <Chips
        name="bedrooms"
        legend={copy.home.bedrooms}
        options={numbered(0, 8, values.bedrooms ?? '').map((count) => ({
          value: count,
          label: count === '0' ? copy.home.studio : count,
        }))}
        defaultValue={values.bedrooms}
        error={errors.bedrooms}
      />
      <Chips
        name="bathrooms"
        legend={copy.home.bathrooms}
        optional
        options={numbered(1, 4, values.bathrooms ?? '').map((count) => ({
          value: count,
          label: count,
        }))}
        defaultValue={values.bathrooms}
        error={errors.bathrooms}
      />
      <Chips
        name="furnished"
        legend={copy.home.furnishing}
        optional
        options={options(furnishing)}
        defaultValue={values.furnished}
        error={errors.furnished}
      />
      <SelectField
        name="berRating"
        label={copy.home.ber}
        optional
        width="medium"
        defaultValue={values.berRating ?? ''}
        error={errors.berRating}
        options={[
          { value: '', label: copy.home.berChoose },
          ...berRatings.map((ber) => ({
            value: ber,
            label: ber === 'exempt' ? copy.home.berExempt : ber,
          })),
        ]}
      />
      <Chips
        name="parking"
        legend={copy.home.parking}
        optional
        options={options(parkingOptions)}
        defaultValue={values.parking}
        error={errors.parking}
      />
    </>
  );
}

/**
 * Step 7, "Letting details" (UX-LT-11): the four fixed criteria, each a row that is off until
 * tapped and then asks for one value, and the one house rule. There is no free text. Under
 * them, the line renters will see, which Gaff writes (UX-MT-3), and why there are only these.
 */
export function DetailsFields({
  values,
  errors,
  availableFrom,
  today,
  onLine,
}: GroupProps & {
  /** The home's available-from date: what "Move in by" starts on. */
  availableFrom: string;
  today: string;
  /** Told the line as it changes, so a step can word its button ("Nothing to add"). */
  onLine?: (line: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const first = useMemo(() => {
    const parsed = lettingDetailsFormSchema().safeParse(values);
    return parsed.success
      ? lettingDetailsLine(parsed.data.criteria, parsed.data.noSmokingIndoors)
      : null;
  }, [values]);
  const [line, setLine] = useState(first);

  /** The line is written from the rows as they stand; a row half filled leaves it as it was. */
  function redraw() {
    const form = box.current?.closest('form');
    if (!form) return;
    const now = Object.fromEntries(
      Array.from(new FormData(form).entries()).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    const parsed = lettingDetailsFormSchema().safeParse(now);
    if (!parsed.success) return;
    const next = lettingDetailsLine(parsed.data.criteria, parsed.data.noSmokingIndoors);
    setLine(next);
    onLine?.(next);
  }
  // After the row's own state has drawn its field (or taken it away).
  const soon = () => requestAnimationFrame(redraw);
  const moveInStart =
    values.moveInBy && values.moveInBy >= today
      ? values.moveInBy
      : availableFrom >= today
        ? availableFrom
        : '';

  return (
    <div ref={box} className={styles.fields} onChange={soon}>
      <div className={styles.rows}>
        <OptionRow
          name="moveInOn"
          label={copy.details.moveIn}
          hint={copy.details.moveInHint}
          defaultOn={values.moveInOn === 'on' || Boolean(errors.moveInBy)}
          onChange={soon}
        >
          <DateField
            name="moveInBy"
            label={copy.details.moveInBy}
            min={today}
            defaultValue={moveInStart}
            error={errors.moveInBy}
            onChange={soon}
          />
        </OptionRow>
        <OptionRow
          name="stayOn"
          label={copy.details.stay}
          hint={copy.details.stayHint}
          defaultOn={values.stayOn === 'on' || Boolean(errors.minStayMonths)}
          onChange={soon}
        >
          <Chips
            name="minStayMonths"
            legend={copy.details.stayField}
            options={minimumStays.map((months) => ({
              value: String(months),
              label: describeStay(months).replace(/^a /, 'A '),
            }))}
            defaultValue={values.minStayMonths || '12'}
            error={errors.minStayMonths}
          />
        </OptionRow>
        <OptionRow
          name="peopleOn"
          label={copy.details.people}
          hint={copy.details.peopleHint}
          defaultOn={values.peopleOn === 'on' || Boolean(errors.maxOccupants)}
          onChange={soon}
        >
          <SelectField
            name="maxOccupants"
            label={copy.details.peopleField}
            width="short"
            defaultValue={values.maxOccupants || '2'}
            error={errors.maxOccupants}
            options={Array.from({ length: MAX_OCCUPANTS_LIMIT }, (_, index) => ({
              value: String(index + 1),
              label: String(index + 1),
            }))}
          />
        </OptionRow>
        <OptionRow
          name="noPets"
          label={copy.details.pets}
          hint={copy.details.petsHint}
          defaultOn={values.noPets === 'on'}
          onChange={soon}
        />
      </div>

      <section className={styles.block} aria-labelledby="house-rule">
        <h2 id="house-rule" className="type-heading">
          {copy.details.houseRule}
        </h2>
        <OptionRow
          name="noSmokingIndoors"
          label={copy.details.noSmoking}
          hint={copy.details.noSmokingHint}
          defaultOn={values.noSmokingIndoors === 'on'}
          onChange={soon}
        />
      </section>

      <section className={styles.block} aria-labelledby="details-preview">
        <h2 id="details-preview" className="type-heading">
          {copy.details.preview}
        </h2>
        <p className={styles.previewLine} role="status">
          {line ?? copy.details.nothing}
        </p>
        <Disclosure summary={copy.details.why}>
          <p>{copy.details.whyText}</p>
        </Disclosure>
      </section>
    </div>
  );
}
