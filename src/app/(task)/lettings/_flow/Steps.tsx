'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { z } from 'zod';
import { addLettingCopy } from '@/copy/add-letting';
import { lettingDetailsFormSchema } from '@/domain/criteria/criteria';
import { addressStepSchema, homeStepSchema, rentStepSchema } from '@/domain/lettings/add-letting';
import { MAX_HOME_PHOTOS } from '@/domain/lettings/photos';
import { fieldErrors, type FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { TextArea, TextField } from '@/ui/Field';
import { FlowExit, FlowShell, FlowTitle } from '@/ui/FlowShell';
import { PhotoUploader, type UploadedPhoto, type UploadResult } from '@/ui/PhotoUploader';
import { SubmitButton } from '@/ui/SubmitButton';
import { AddressFields, DescriptionFields, DetailsFields, HomeFields, RentFields } from './fields';
import styles from './flow.module.css';
import { firstAddressHref, screenHref } from '@/domain/lettings/links';
import { progressFor, StepForm, type StepFrame } from './StepForm';

const copy = addLettingCopy;

type Action = (state: FormState, data: FormData) => Promise<FormState>;

/** A step's rule as the problems by field, for the form to show where they are. */
const problemsBy = (schema: () => z.ZodType) => (values: Record<string, string>) => {
  const parsed = schema().safeParse(values);
  return parsed.success ? {} : fieldErrors(parsed.error);
};

/**
 * Step 1, "Tell Gaff about the home" (UX-LT-1): one box for a pasted advert or a description,
 * one primary button, and the quiet way round it, "Fill it in myself". A Daft or MyHome link
 * is kept and never fetched (UX-LT-8).
 *
 * Reading what's in the box is work package WP-10. Until it is switched on (`readerOn`), the
 * box answers that it can't read adverts yet, what was typed stays, and the attach button,
 * which only the reader has a use for, isn't shown.
 */
export function StartStep({
  frame,
  action,
  from,
  draftId,
  kept,
  readerOn,
  drafts,
}: {
  frame: StepFrame;
  action: Action;
  from: string | null;
  /** A draft that holds only an advert link so far. */
  draftId: string | null;
  /** UX-LT-8: a link was just kept. */
  kept: boolean;
  readerOn: boolean;
  /** Homes this organisation started and didn't finish, to carry on with (UX-FL-2). */
  drafts: ReadonlyArray<{ id: string; label: string; href: string }>;
}) {
  return (
    <StepForm
      id="start"
      frame={frame}
      action={action}
      title={copy.start.title}
      primary={copy.start.continue}
    >
      {({ errors, values }) => {
        const draft = values?.draft || draftId;
        return (
          <>
            <TextArea
              name="about"
              label={copy.start.box}
              rows={8}
              defaultValue={values?.about ?? ''}
              error={errors.about}
            />
            {kept && !errors.about ? (
              <p className={styles.note} role="status">
                <Check size={20} strokeWidth={2} aria-hidden="true" />
                <span>{copy.start.linkKept}</span>
              </p>
            ) : null}
            {readerOn ? (
              // Only the reader has a use for these (work package WP-10), so they wait for it.
              <TextField
                name="files"
                type="file"
                multiple
                optional
                label={copy.start.attach}
                accept=".pdf,.doc,.docx,image/*"
              />
            ) : null}
            <div className={styles.aside}>
              <ButtonLink
                href={draft ? screenHref(draft, 'address', from) : firstAddressHref(from)}
                variant="quiet"
              >
                {copy.start.manual}
              </ButtonLink>
            </div>
            {drafts.length > 0 ? (
              <section className={styles.drafts} aria-labelledby="drafts-heading">
                <h2 id="drafts-heading" className="type-heading">
                  {copy.start.drafts}
                </h2>
                <ul className={styles.factList}>
                  {drafts.map((each) => (
                    <li key={each.id}>
                      <Link href={each.href}>{each.label}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        );
      }}
    </StepForm>
  );
}

/** Step 3, "Where is it?" (UX-LT-9). */
export function AddressStep({
  frame,
  action,
  values: start,
  searchOn,
}: {
  frame: StepFrame;
  action: Action;
  values: Record<string, string>;
  searchOn: boolean;
}) {
  const check = (values: Record<string, string>): Record<string, string> =>
    values.addressLine1 === undefined
      ? { addressSearch: copy.address.choose }
      : problemsBy(addressStepSchema)(values);
  return (
    <StepForm id="address" frame={frame} action={action} check={check} title={copy.address.title}>
      {({ errors, values }) => (
        <AddressFields values={values ?? start} errors={errors} searchOn={searchOn} />
      )}
    </StepForm>
  );
}

/** Step 4, "Rent and date". */
export function RentStep({
  frame,
  action,
  values: start,
  today,
  inAYear,
}: {
  frame: StepFrame;
  action: Action;
  values: Record<string, string>;
  today: string;
  inAYear: string;
}) {
  return (
    <StepForm
      id="rent"
      frame={frame}
      action={action}
      check={problemsBy(rentStepSchema)}
      title={copy.rent.title}
    >
      {({ errors, values }) => (
        <RentFields values={values ?? start} errors={errors} today={today} inAYear={inAYear} />
      )}
    </StepForm>
  );
}

/** Step 5, "The home". */
export function HomeStep({
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
      id="home"
      frame={frame}
      action={action}
      check={problemsBy(homeStepSchema)}
      title={copy.home.title}
    >
      {({ errors, values }) => (
        <>
          <HomeFields values={values ?? start} errors={errors} />
          <DescriptionFields values={values ?? start} errors={errors} />
        </>
      )}
    </StepForm>
  );
}

/**
 * Step 6, "Photos" (UX-LT-10). Each photo is kept as it uploads, so there is nothing for the
 * button to save: it moves on, as Next with photos or "Skip for now" without.
 */
export function PhotosStep({
  frame,
  photos,
  upload,
  remove,
  reorder,
  done,
  problem,
}: {
  frame: StepFrame;
  photos: UploadedPhoto[];
  upload: (data: FormData) => Promise<UploadResult>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  done: () => Promise<void>;
  problem?: string;
}) {
  const [count, setCount] = useState(photos.length);
  return (
    <FlowShell
      leave={{ kind: 'close', href: frame.leaveHref }}
      progress={frame.step ? progressFor(frame.step) : undefined}
      saveAndExit={<FlowExit href={frame.leaveHref}>{copy.saveAndExit}</FlowExit>}
      back={
        frame.backHref ? (
          <ButtonLink href={frame.backHref} variant="quiet">
            {copy.back}
          </ButtonLink>
        ) : undefined
      }
      primary={
        <SubmitButton fullWidth="phone" pendingLabel={copy.saving}>
          {count > 0 ? copy.next : copy.photos.skip}
        </SubmitButton>
      }
      form={{ action: done }}
    >
      <FlowTitle title={copy.photos.title} />
      <PhotoUploader
        photos={photos}
        max={MAX_HOME_PHOTOS}
        upload={upload}
        remove={remove}
        reorder={reorder}
        problem={problem}
        onCount={setCount}
      />
    </FlowShell>
  );
}

/**
 * Step 7, "Letting details" (UX-LT-11). In the flow its button is Next, or "Nothing to add"
 * while every row is off. Opened on its own from the letting's page, it is Save.
 */
export function DetailsStep({
  frame,
  action,
  values: start,
  availableFrom,
  today,
  alone,
  startsWithLine,
}: {
  frame: StepFrame;
  action: Action;
  values: Record<string, string>;
  availableFrom: string;
  today: string;
  alone: boolean;
  startsWithLine: boolean;
}) {
  const [asked, setAsked] = useState(startsWithLine);
  return (
    <StepForm
      id="details"
      frame={frame}
      action={action}
      check={problemsBy(lettingDetailsFormSchema)}
      title={copy.details.title}
      lead={copy.details.lead}
      primary={alone ? copy.save : asked ? copy.next : copy.details.nothingToAdd}
    >
      {({ errors, values }) => (
        <DetailsFields
          values={values ?? start}
          errors={errors}
          availableFrom={availableFrom}
          today={today}
          onLine={(line) => setAsked(line !== null)}
        />
      )}
    </StepForm>
  );
}
