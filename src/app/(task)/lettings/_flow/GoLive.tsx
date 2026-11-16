'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { addLettingCopy } from '@/copy/add-letting';
import { berRatings } from '@/domain/lettings/new-letting';
import { phoneFieldSchema } from '@/domain/organisations/phone';
import type { FormState } from '@/lib/forms';
import { ButtonLink } from '@/ui/Button';
import { SelectField, TextField } from '@/ui/Field';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Notice } from '@/ui/Notice';
import { OptionRow } from '@/ui/OptionRow';
import { StatusPill } from '@/ui/StatusPill';
import styles from './flow.module.css';
import { progressFor, StepForm, type StepFrame } from './StepForm';

const copy = addLettingCopy;
const g = copy.goLive;

type Action = (state: FormState, data: FormData) => Promise<FormState>;

/** The phone number's own rule, as the server applies it (Q43): offered, never required. */
function check(values: Record<string, string>): Record<string, string> {
  const phone = phoneFieldSchema.safeParse(values.phone);
  return phone.success ? {} : { phone: phone.error.issues[0]!.message };
}

/**
 * Step 9, "Ready to go live": the home as renters will see it, "On gaff.ie", and anything still
 * to do first, each asked once. One primary button, and pressing it is the person's decision
 * (UX-LT-15). Nothing asked here can stop it (UX-LT-14): a number renters can call and a BER
 * are offered, and the private landlord's identity check is shown as coming (work package
 * WP-24).
 */
export function GoLiveStep({
  frame,
  action,
  preview,
  onGaff,
  needsBer,
  needsPhoto,
  photosHref,
  askPhone,
  identityLater,
}: {
  frame: StepFrame;
  action: Action;
  /** The home's page as renters will see it. */
  preview: ReactNode;
  /** "On gaff.ie", as it stands. */
  onGaff: boolean;
  /** UX-LT-22: what the home still needs to be shown on gaff.ie. Neither stops go-live. */
  needsBer: boolean;
  needsPhoto: boolean;
  photosHref: string;
  /** Q43: a number renters can call, asked once, at the lister's first go-live. */
  askPhone: boolean;
  /** Q47: "Confirm it's you", in place for work package WP-24. It holds nothing yet. */
  identityLater: boolean;
}) {
  return (
    <StepForm
      id="go-live"
      frame={frame}
      action={action}
      check={check}
      title={g.title}
      lead={g.lead}
      primary={g.start}
      pending={g.starting}
    >
      {({ errors, values }) => (
        <>
          {preview}
          <section className={styles.block} aria-label={g.onGaff}>
            <input type="hidden" name="onGaffAsked" value="1" />
            <OptionRow
              name="onGaff"
              label={g.onGaff}
              hint={g.onGaffHint}
              defaultOn={values ? values.onGaff === 'on' : onGaff}
            />
            {needsBer ? (
              <SelectField
                name="berRating"
                label={g.ber}
                hint={g.berHint}
                optional
                width="medium"
                defaultValue={values?.berRating ?? ''}
                error={errors.berRating}
                options={[
                  { value: '', label: copy.home.berChoose },
                  ...berRatings.map((ber) => ({
                    value: ber,
                    label: ber === 'exempt' ? copy.home.berExempt : ber,
                  })),
                ]}
              />
            ) : null}
            {needsPhoto ? (
              <p>
                {g.needsPhoto} <Link href={photosHref}>{g.addPhoto}</Link>
              </p>
            ) : null}
            {needsBer || needsPhoto ? <p className={styles.muted}>{g.shownLater}</p> : null}
          </section>
          {askPhone ? (
            <TextField
              name="phone"
              type="tel"
              label={g.phone}
              hint={g.phoneHint}
              optional
              width="medium"
              autoComplete="tel"
              defaultValue={values?.phone ?? ''}
              error={errors.phone}
            />
          ) : null}
          {identityLater ? (
            <section className={styles.block} aria-labelledby="identity-heading">
              <h2 id="identity-heading" className={`type-heading ${styles.withPill}`}>
                <span>{g.identity}</span>
                <StatusPill>{g.later}</StatusPill>
              </h2>
              <p className={styles.muted}>{g.identityLater}</p>
            </section>
          ) : null}
        </>
      )}
    </StepForm>
  );
}

/**
 * The go-live step when the home can't go live yet for a reason this screen can't put right:
 * an agency with no licence on the register, or one whose licence has lapsed (UX-AG-2,
 * UX-AG-6). It says why, and what happens next; there is nothing to press but the way back.
 */
export function GoLiveHeld({
  frame,
  preview,
  why,
  fix,
  lettingHref,
}: {
  frame: StepFrame;
  preview: ReactNode;
  why: string;
  /** Where the reason can be put right, if anywhere: "Find our licence". */
  fix: { href: string; label: string } | null;
  lettingHref: string;
}) {
  return (
    <FlowShell
      leave={{ kind: 'close', href: frame.leaveHref }}
      progress={frame.step ? progressFor(frame.step) : undefined}
      back={
        frame.backHref ? (
          <ButtonLink href={frame.backHref} variant="quiet">
            {copy.back}
          </ButtonLink>
        ) : undefined
      }
      primary={
        <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
          {g.backToLetting}
        </ButtonLink>
      }
    >
      <FlowTitle title={g.title} />
      <Notice tone="warning">
        <p>
          {why}
          {fix ? (
            <>
              {' '}
              <Link href={fix.href}>{fix.label}</Link>.
            </>
          ) : null}
        </p>
      </Notice>
      {preview}
    </FlowShell>
  );
}
