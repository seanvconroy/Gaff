import type { Metadata } from 'next';
import Link from 'next/link';
import { decisionsCopy } from '@/copy/decisions';
import { offerEmail } from '@/copy/templates/offers';
import { firstNameOf } from '@/domain/accounts/first-run';
import { decisionHref } from '@/domain/lettings/links';
import { checksStillUnderWay } from '@/domain/offers/approval';
import {
  deadlineChoices,
  offerBlockers,
  offerExpiry,
  offerTermsSchema,
  parseEuro,
  whoCanBeOffered,
  type OfferBlocker,
} from '@/domain/offers/offer';
import { formatDate, formatDateTime, formatEuro, irishToday } from '@/lib/format';
import { applicantsFor } from '@/server/applications/choose';
import { approvalFor } from '@/server/offers/approval';
import { offersFor } from '@/server/offers/offer';
import { ButtonLink } from '@/ui/Button';
import { ChoiceGroup, FieldError, TextField } from '@/ui/Field';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { MessagePreview } from '@/ui/MessagePreview';
import { Notice } from '@/ui/Notice';
import { OptionRow } from '@/ui/OptionRow';
import { Outcome } from '@/ui/Outcome';
import { DateField } from '@/ui/Pickers';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { loadDecision, one } from '../_decisions/load';
import { makeOfferAction } from './actions';

export const metadata: Metadata = { title: decisionsCopy.offer.metaTitle };

const copy = decisionsCopy.offer;
type Query = Record<string, string | string[] | undefined>;
type Field = 'deposit' | 'startDate' | 'deadlineHours';

/**
 * The offer (UX-DC-17 to UX-DC-20; R20). It opens filled in: the rent, a deposit of one month's
 * rent (the most allowed, rule 4), the available-from date, 48 hours to answer, and "If Aoife says
 * no or doesn't answer, offer it to Ciarán" on. Each term has "Change". In the common case the
 * person reads it and presses two buttons: Next, then "Send the offer to Aoife" on "Check and
 * send", which is their `make_offer` decision (`makeOffer`, ADR-0007). Until the owner has
 * approved, three comparable rents are in and the checks are back (or the person goes ahead
 * without them), the first screen names what's missing at its place and links to it (UX-DC-19).
 * The terms ride in the address between the two screens: amounts and dates, never a person.
 */
export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<Query>;
}) {
  const { member, letting, comparables, lettingHref } = await loadDecision(params);
  const query = await searchParams;
  const step = one(query.step);
  const here = decisionHref(letting.id, 'offer');
  const leave = { kind: 'close' as const, href: lettingHref };
  const done = (
    <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
      {decisionsCopy.done}
    </ButtonLink>
  );
  const [state, listing, sent] = await Promise.all([
    approvalFor(member, letting.id),
    applicantsFor(member, letting.id),
    offersFor(member, letting.id),
  ]);
  const rows = listing?.rows ?? [];

  // An offer that's out, or taken: what happens next (UX-FL-4).
  const open = sent.find((s) => s.offer.status === 'open');
  const accepted = sent.find((s) => s.offer.status === 'accepted');
  if (accepted) {
    return (
      <FlowShell
        leave={leave}
        primary={
          <ButtonLink href={`${lettingHref}/tenancy`} variant="primary" fullWidth="phone">
            {copy.accepted.action}
          </ButtonLink>
        }
      >
        <Outcome
          tone="success"
          title={copy.accepted.title(firstNameOf(accepted.name))}
          headingLevel={1}
        >
          <p>{copy.accepted.text}</p>
        </Outcome>
      </FlowShell>
    );
  }
  if (open) {
    const first = firstNameOf(open.name);
    const backupName = open.offer.thenOfferToId
      ? firstNameOf(rows.find((r) => r.id === open.offer.thenOfferToId)?.name ?? '')
      : null;
    return (
      <FlowShell leave={leave} primary={done}>
        {step === 'sent' ? (
          <Outcome tone="success" title={copy.sent.title} headingLevel={1} role="status">
            <p>{copy.sent.text(first, open.offer.expiresAt)}</p>
            {backupName ? <p>{copy.sent.backup(backupName)}</p> : null}
          </Outcome>
        ) : (
          <Outcome tone="waiting" title={copy.out.title(first)} headingLevel={1}>
            <p>{copy.out.text(first, open.offer.expiresAt)}</p>
            {backupName ? <p>{copy.sent.backup(backupName)}</p> : null}
          </Outcome>
        )}
      </FlowShell>
    );
  }

  const preferred = rows.find((r) => r.id === state?.preferredId && r.status === 'preferred');
  if (!state || !preferred || !listing || letting.status !== 'live') {
    return (
      <FlowShell
        leave={leave}
        primary={
          <ButtonLink href={decisionHref(letting.id, 'choose')} variant="primary" fullWidth="phone">
            {copy.nobody.action}
          </ButtonLink>
        }
      >
        <Outcome tone="info" title={copy.nobody.title} headingLevel={1}>
          <p>{copy.nobody.text}</p>
        </Outcome>
      </FlowShell>
    );
  }

  const first = firstNameOf(preferred.name);
  const backupRow = rows.find((r) => r.id === state.backupId);
  const who = whoCanBeOffered({
    route: state.route,
    approval: state.approval,
    hasBackup: state.backupId !== null,
  });
  // UX-DC-20: offered to the backup on its own only if the person leaves this on.
  const canOfferBackup = Boolean(backupRow && who.backup);
  const owner = state.landlord ? firstNameOf(state.landlord.name) : 'The owner';
  const today = irishToday();
  const rent = formatEuro(letting.monthlyRentCents);
  const asked = one(query.terms) === '1';
  const values = {
    deposit: one(query.deposit) ?? (letting.monthlyRentCents / 100).toLocaleString('en-IE'),
    startDate:
      one(query.startDate) ?? (letting.availableFrom > today ? letting.availableFrom : today),
    deadlineHours: one(query.deadlineHours) ?? '48',
    offerBackup: canOfferBackup && (asked ? one(query.offerBackup) === 'on' : true) ? 'yes' : '',
    withoutChecks: one(query.withoutChecks) === 'on' ? 'yes' : '',
  };
  const parsed = offerTermsSchema(letting.monthlyRentCents, today).safeParse(values);
  const errors: Partial<Record<Field, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[issue.path[0] as Field] ??= issue.message;
  }
  const blockers = offerBlockers({
    route: state.route,
    approval: state.approval,
    hasBackup: state.backupId !== null,
    comparables: comparables.length,
    checks: preferred.checks,
    withoutChecks: values.withoutChecks === 'yes',
  });
  const checksWaiting = checksStillUnderWay(preferred.checks);
  const progress = (at: number) => ({ label: copy.progress, segments: copy.steps, current: at });
  const termsQuery = (extra: Record<string, string | undefined> = {}) => ({
    terms: '1',
    deposit: values.deposit,
    startDate: values.startDate,
    deadlineHours: values.deadlineHours,
    offerBackup: values.offerBackup ? 'on' : undefined,
    withoutChecks: values.withoutChecks ? 'on' : undefined,
    ...extra,
  });
  const problem = one(query.problem);

  // Step 2: check and send. The message in its fixed wording, with the terms in it.
  if (step === 'check' && parsed.success && blockers.length === 0) {
    const terms = parsed.data;
    const message = offerEmail({
      renterName: preferred.name,
      operatorName: member.organisationName,
      address: letting.addressLine1,
      area: letting.area,
      rent,
      deposit: formatEuro(terms.depositCents),
      startDate: formatDate(terms.startDate),
      deadline: formatDateTime(offerExpiry(new Date(), terms.deadlineHours)),
      offerUrl: '(their own private link)',
    });
    const backHref = decisionHref(letting.id, 'offer', termsQuery());
    return (
      <FlowShell
        leave={{ kind: 'back', href: backHref, label: decisionsCopy.back }}
        progress={progress(1)}
        form={{ action: makeOfferAction.bind(null, letting.id) }}
        back={
          <ButtonLink href={backHref} variant="quiet">
            {decisionsCopy.back}
          </ButtonLink>
        }
        primary={
          <SubmitButton fullWidth="phone" pendingLabel={copy.check.sending}>
            {copy.check.send(first)}
          </SubmitButton>
        }
      >
        <FlowTitle title={copy.check.title} lead={copy.check.lead(first)} />
        {Object.entries(values).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <MessagePreview label={copy.check.label} {...message} />
        {problem ? <FieldError id="offer-problem">{problem}</FieldError> : null}
      </FlowShell>
    );
  }

  // Step 1: the terms, already filled in, each with "Change" (UX-DC-17).
  const tried = step === 'check';
  const editing = new Set<Field>(
    [one(query.edit) as Field, ...(tried ? (Object.keys(errors) as Field[]) : [])].filter(Boolean),
  );
  const change = (field: Field, what: string) =>
    editing.has(field) ? undefined : (
      <Link href={decisionHref(letting.id, 'offer', termsQuery({ edit: field }))}>
        {decisionsCopy.change}
        <span className="visually-hidden"> {what}</span>
      </Link>
    );
  const hidden = (field: Field) =>
    editing.has(field) ? null : <input type="hidden" name={field} value={values[field]} />;
  const typedCents = parseEuro(values.deposit);
  const missing = (code: OfferBlocker['code']) =>
    tried && blockers.some((b) => b.code === code) ? (
      <FieldError id={`missing-${code}`}>{copy.blockers.stillMissing}</FieldError>
    ) : null;

  return (
    <FlowShell
      leave={leave}
      progress={progress(0)}
      form={{ method: 'get', action: here }}
      primary={
        <SubmitButton fullWidth="phone" name="step" value="check">
          {decisionsCopy.next}
        </SubmitButton>
      }
    >
      <FlowTitle title={copy.title} lead={copy.lead(first)} />
      <input type="hidden" name="terms" value="1" />
      {/* UX-DC-19: what the offer waits for, each said plainly and linked to. */}
      {blockers.map((blocker) => {
        if (blocker.code === 'owner') {
          const text =
            blocker.standing === 'waiting'
              ? copy.blockers.owner.waiting(
                  owner,
                  state.approval?.remindedAt ?? state.approval?.requestedAt ?? null,
                )
              : blocker.standing === 'declined'
                ? copy.blockers.owner.declined(owner)
                : copy.blockers.owner.ask(owner);
          const link =
            blocker.standing === 'declined'
              ? {
                  href: decisionHref(letting.id, 'choose'),
                  words: copy.blockers.owner.declinedLink,
                }
              : {
                  href: decisionHref(letting.id, 'approval'),
                  words:
                    blocker.standing === 'waiting'
                      ? copy.blockers.owner.waitingLink(owner)
                      : copy.blockers.owner.askLink(owner),
                };
          return (
            <Stack key="owner" gap={2}>
              <Notice tone="warning">
                <p>
                  {text} <Link href={link.href}>{link.words}</Link>
                </p>
              </Notice>
              {missing('owner')}
            </Stack>
          );
        }
        if (blocker.code === 'comparables') {
          return (
            <Stack key="comparables" gap={2}>
              <Notice tone="warning">
                <p>
                  {copy.blockers.comparables(blocker.recorded)}{' '}
                  <Link href={`${lettingHref}/comparables`}>{copy.blockers.comparablesLink}</Link>
                </p>
              </Notice>
              {missing('comparables')}
            </Stack>
          );
        }
        return null;
      })}
      <SummaryList
        rows={[
          { label: copy.rent, value: copy.rentValue(rent) },
          {
            label: copy.deposit,
            value: editing.has('deposit') ? (
              <TextField
                name="deposit"
                label={copy.deposit}
                hint={copy.depositHint(rent)}
                prefix="€"
                width="short"
                inputMode="decimal"
                defaultValue={values.deposit}
                error={errors.deposit}
              />
            ) : (
              copy.depositValue(
                formatEuro(typedCents ?? 0),
                typedCents === letting.monthlyRentCents,
              )
            ),
            action: change('deposit', copy.deposit),
          },
          {
            label: copy.startDate,
            value: editing.has('startDate') ? (
              <DateField
                name="startDate"
                label={copy.startDate}
                min={today}
                defaultValue={values.startDate}
                error={errors.startDate}
              />
            ) : (
              formatDate(values.startDate)
            ),
            action: change('startDate', copy.startDate),
          },
          {
            label: copy.deadline,
            value: editing.has('deadlineHours') ? (
              <ChoiceGroup
                name="deadlineHours"
                legend={copy.deadline}
                inline
                defaultValue={values.deadlineHours}
                error={errors.deadlineHours}
                options={deadlineChoices.map((hours) => ({
                  value: String(hours),
                  label: copy.deadlineValue(hours),
                }))}
              />
            ) : (
              copy.deadlineValue(Number(values.deadlineHours))
            ),
            action: change('deadlineHours', copy.deadline),
          },
        ]}
      />
      {hidden('deposit')}
      {hidden('startDate')}
      {hidden('deadlineHours')}
      {canOfferBackup && backupRow ? (
        <OptionRow
          name="offerBackup"
          label={copy.backupRow(first, firstNameOf(backupRow.name))}
          hint={copy.backupHint}
          defaultOn={values.offerBackup === 'yes'}
        />
      ) : null}
      {checksWaiting > 0 ? (
        <Stack gap={2}>
          <Notice tone="warning">
            <p>
              {copy.blockers.checks(checksWaiting)}{' '}
              <Link href={decisionHref(letting.id, 'checks')}>{copy.blockers.checksLink}</Link>
            </p>
          </Notice>
          <OptionRow
            name="withoutChecks"
            label={copy.blockers.withoutChecks}
            hint={copy.blockers.withoutChecksHint}
            defaultOn={values.withoutChecks === 'yes'}
          />
          {missing('checks')}
        </Stack>
      ) : null}
      {problem ? <FieldError id="offer-problem">{problem}</FieldError> : null}
    </FlowShell>
  );
}
