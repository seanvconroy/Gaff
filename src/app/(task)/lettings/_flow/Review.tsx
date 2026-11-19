'use client';

import { House, Images, ListChecks, MapPin, type LucideIcon, Text, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import type { z } from 'zod';
import { addLettingCopy } from '@/copy/add-letting';
import { lettingDetailsFormSchema } from '@/domain/criteria/criteria';
import {
  type CheckThis,
  type DraftOrigin,
  type ReviewGroup,
  addressStepSchema,
  descriptionSchema,
  homeFactsSchema,
  rentStepSchema,
} from '@/domain/lettings/add-letting';
import { MAX_HOME_PHOTOS } from '@/domain/lettings/photos';
import { fieldErrors, type FormState } from '@/lib/forms';
import { ActionList, ActionRow } from '@/ui/ActionList';
import { Button } from '@/ui/Button';
import { FieldError } from '@/ui/Field';
import { FlowProblems, FlowShell, FlowTitle } from '@/ui/FlowShell';
import {
  type DirectUpload,
  PhotoUploader,
  type UploadedPhoto,
  type UploadResult,
} from '@/ui/PhotoUploader';
import { Sheet } from '@/ui/Sheet';
import { StatusPill } from '@/ui/StatusPill';
import { SummaryList } from '@/ui/SummaryList';
import { SubmitButton } from '@/ui/SubmitButton';
import { useFlowForm } from '@/ui/useFlowForm';
import {
  AddressFields,
  DescriptionFields,
  DetailsFields,
  type GroupProps,
  HomeFields,
  RentFields,
} from './fields';
import styles from './flow.module.css';
import type { StepFrame } from './StepForm';

const copy = addLettingCopy;
const r = copy.review;

type Action = (state: FormState, data: FormData) => Promise<FormState>;

/** What the review shows of the home, a part at a time: `photos`, the four groups, `details`. */
export type ReviewPart = 'photos' | ReviewGroup | 'details';

export interface ReviewRow {
  part: ReviewPart;
  /** What's there, in words; or what's missing ("No date yet"). */
  value: string;
  /** Opens this part's sheet. */
  href: string;
}

const rowCopy: Record<ReviewPart, { title: string; icon: LucideIcon; checks: CheckThis[] }> = {
  photos: { title: r.photos, icon: Images, checks: ['photos'] },
  address: { title: r.address, icon: MapPin, checks: ['address'] },
  rent: { title: r.rent, icon: Wallet, checks: ['rent', 'available_from'] },
  home: { title: r.facts, icon: House, checks: ['home', 'ber'] },
  description: { title: r.description, icon: Text, checks: [] },
  details: { title: r.details, icon: ListChecks, checks: ['details'] },
};

/**
 * What a home that was read shows on its review (UX-LT-3, UX-LT-6, UX-AI-4), in words: for each
 * part, the words each value came from, shown in the sheet its row opens; the lines left out,
 * each with why. Built by the page from the draft's reading.
 */
export interface ReadingView {
  from: 'advert' | 'enquiry';
  sources: Partial<
    Record<ReviewPart, ReadonlyArray<{ label: string; quote: string; note: string | null }>>
  >;
  /** Notes for the description's sheet: what is still in the lister's own words. */
  ownWords: readonly string[];
  /** The advert says something that could be a letting detail. A person decides. */
  suggested: boolean;
  leftOut: ReadonlyArray<{ line: string; why: string }>;
}

/** UX-LT-3: "From your advert: 'gas fired central heating'", at the top of a part's sheet. */
function Sources({ reading, part }: { reading: ReadingView | null; part: ReviewPart }) {
  if (!reading) return null;
  const words = r.read[reading.from];
  const found = reading.sources[part] ?? [];
  const notes = [
    ...(part === 'description' ? reading.ownWords : []),
    ...(part === 'details' && reading.suggested ? [r.suggested.note] : []),
  ];
  if (found.length === 0 && notes.length === 0) return null;
  return (
    <section className={styles.sources} aria-labelledby={`sources-${part}`}>
      <h3 id={`sources-${part}`} className="type-heading">
        {words.from}
      </h3>
      {found.length > 0 ? (
        <SummaryList
          rows={found.map((each) => ({
            label: each.label,
            value: (
              <>
                <span className={styles.quote}>{each.quote}</span>
                {each.note ? <span className={styles.sourceNote}>{each.note}</span> : null}
              </>
            ),
          }))}
        />
      ) : null}
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </section>
  );
}

/** UX-LT-6: said once, on the review: how many lines were left out, and why, behind "Why?". */
function LeftOut({ lines }: { lines: ReadingView['leftOut'] }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <>
      <div className={styles.leftOut}>
        <p>{r.leftOut(lines.length)}</p>
        <Button variant="quiet" onClick={() => setOpen(true)}>
          {r.why}
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={r.leftOutLines}
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            {r.done}
          </Button>
        }
      >
        <p>{r.whyText}</p>
        <SummaryList
          rows={lines.map((each) => ({
            label: <span className={styles.quote}>{r.read.quote(each.line)}</span>,
            value: each.why,
          }))}
        />
      </Sheet>
    </>
  );
}

const problemsBy = (schema: () => z.ZodType) => (values: Record<string, string>) => {
  const parsed = schema().safeParse(values);
  return parsed.success ? {} : fieldErrors(parsed.error);
};

const rules: Record<
  ReviewGroup | 'details',
  (values: Record<string, string>) => Record<string, string>
> = {
  address: problemsBy(addressStepSchema),
  rent: problemsBy(rentStepSchema),
  home: problemsBy(homeFactsSchema),
  description: problemsBy(descriptionSchema),
  details: problemsBy(lettingDetailsFormSchema),
};

/** One part's fields, in its sheet. Saving keeps the change and closes the sheet (UX-LT-4). */
function PartForm({
  action,
  check,
  onSaved,
  children,
}: {
  action: Action;
  check: (values: Record<string, string>) => Record<string, string>;
  onSaved: () => void;
  children: (
    fields: Pick<GroupProps, 'errors'> & { typed: Record<string, string> | null },
  ) => ReactNode;
}) {
  const { form, errors, count, values, attempt, state } = useFlowForm(action, check);
  const saved = values?.saved === '1';
  useEffect(() => {
    if (saved) onSaved();
    // Once for each answer from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.attempt]);
  return (
    <form {...form} className={styles.sheetForm}>
      <FlowProblems count={count} />
      <div key={attempt} className={styles.fields}>
        {children({ errors, typed: saved ? null : (values ?? null) })}
      </div>
      {errors.form ? <FieldError id="review-problem">{errors.form}</FieldError> : null}
      <div>
        <SubmitButton pendingLabel={copy.saving}>{copy.save}</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Step 2, the review (UX-LT-4): the home as it stands, a part to a row, not a form. Anything
 * missing or out of date is marked "Check this" and counted at the top (UX-LT-3: nothing is
 * filled in for the person). Tapping a row opens that part in a sheet. "Looks right" moves on
 * to the first step that still needs an answer (UX-LT-5).
 *
 * "Let it again" opens here, with everything from last time (UX-LT-23). The advert reader
 * (work package WP-10) opens here too, with what it found.
 */
export function ReviewStep({
  frame,
  origin,
  rows,
  checks,
  reading,
  open,
  reviewHref,
  looksRight,
  save,
  values,
  details,
  availableFrom,
  today,
  inAYear,
  searchOn,
  photos,
  upload,
  direct,
  remove,
  reorder,
  setKind,
}: {
  frame: StepFrame;
  origin: DraftOrigin;
  rows: readonly ReviewRow[];
  /** What to look at, counted at the top. */
  checks: readonly CheckThis[];
  /** For a home that was read from an advert or an enquiry: where its values came from. */
  reading: ReadingView | null;
  /** The part whose sheet is open, from the address bar. */
  open: ReviewPart | null;
  /** This screen with no sheet open. */
  reviewHref: string;
  looksRight: () => Promise<void>;
  save: Record<ReviewGroup | 'details', Action>;
  /** What the sheets' fields start with. */
  values: Record<string, string>;
  details: Record<string, string>;
  availableFrom: string;
  today: string;
  inAYear: string;
  searchOn: boolean;
  photos: UploadedPhoto[];
  upload: (data: FormData) => Promise<UploadResult>;
  /** M43: photos straight to the store, where it can take them. */
  direct?: DirectUpload;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  /** M44: marks a picture as a floor plan, or a photo again. */
  setKind?: (id: string, kind: 'photo' | 'floor_plan') => Promise<void>;
}) {
  const router = useRouter();
  const close = () => {
    router.replace(reviewHref, { scroll: false });
    router.refresh();
  };
  const form = open && open !== 'photos' ? open : null;
  return (
    <>
      <FlowShell
        leave={{ kind: 'close', href: frame.leaveHref }}
        primary={
          <SubmitButton fullWidth="phone" pendingLabel={copy.saving}>
            {r.looksRight}
          </SubmitButton>
        }
        form={{ action: looksRight }}
      >
        <FlowTitle
          title={r.title[origin]}
          lead={
            reading ? r.read[reading.from].note : origin === 'again' ? r.lead.again : r.lead.other
          }
        />
        <p className={styles.count}>
          {/* UX-AI-1, UX-AI-4: what the AI filled in is marked as the AI's. */}
          {reading?.from === 'advert' ? (
            <StatusPill tone="ai">{r.read.advert.pill}</StatusPill>
          ) : null}
          <span role="status">
            {checks.length > 0 ? (
              <StatusPill tone="warning">{r.toCheck(checks.length)}</StatusPill>
            ) : (
              <StatusPill tone="success">{r.nothingToCheck}</StatusPill>
            )}
          </span>
        </p>
        <ActionList>
          {rows.map((row) => {
            const { title, icon, checks: mine } = rowCopy[row.part];
            const toCheck = mine.some((check) => checks.includes(check));
            return (
              <ActionRow
                key={row.part}
                id={`review-${row.part}`}
                href={row.href}
                icon={icon}
                title={title}
                meta={row.value}
                trailing={toCheck ? <StatusPill tone="warning">{r.checkThis}</StatusPill> : null}
              />
            );
          })}
        </ActionList>
        <LeftOut lines={reading?.leftOut ?? []} />
      </FlowShell>

      {/* Beside the shell, not inside it: each sheet's form is its own. */}
      <Sheet
        open={open === 'photos'}
        onClose={close}
        title={r.photos}
        footer={
          <Button variant="primary" onClick={close}>
            {r.done}
          </Button>
        }
      >
        <PhotoUploader
          photos={photos}
          max={MAX_HOME_PHOTOS}
          upload={upload}
          direct={direct}
          remove={remove}
          reorder={reorder}
          setKind={setKind}
        />
      </Sheet>
      <Sheet open={form !== null} onClose={close} title={form ? rowCopy[form].title : ''}>
        {form ? (
          <PartForm key={form} action={save[form]} check={rules[form]} onSaved={close}>
            {({ errors, typed }) => (
              <>
                <Sources reading={reading} part={form} />
                {form === 'address' ? (
                  <AddressFields values={typed ?? values} errors={errors} searchOn={searchOn} />
                ) : form === 'rent' ? (
                  <RentFields
                    values={typed ?? values}
                    errors={errors}
                    today={today}
                    inAYear={inAYear}
                  />
                ) : form === 'home' ? (
                  <HomeFields values={typed ?? values} errors={errors} />
                ) : form === 'description' ? (
                  <DescriptionFields values={typed ?? values} errors={errors} />
                ) : (
                  <DetailsFields
                    values={typed ?? details}
                    errors={errors}
                    availableFrom={availableFrom}
                    today={today}
                  />
                )}
              </>
            )}
          </PartForm>
        ) : null}
      </Sheet>
    </>
  );
}
