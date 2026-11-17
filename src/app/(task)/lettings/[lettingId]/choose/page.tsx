import type { Metadata } from 'next';
import Link from 'next/link';
import { decisionsCopy, meetsWords } from '@/copy/decisions';
import { firstNameOf } from '@/domain/accounts/first-run';
import { earningLabels } from '@/domain/applications/apply';
import { decisionHref } from '@/domain/lettings/links';
import { formatDateTime, formatEuro } from '@/lib/format';
import { applicantsFor } from '@/server/applications/choose';
import { ButtonLink } from '@/ui/Button';
import { ChoiceGroup, FieldError } from '@/ui/Field';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Outcome } from '@/ui/Outcome';
import { PersonCard, PersonCards } from '@/ui/PersonCard';
import { StatusPill } from '@/ui/StatusPill';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { loadDecision, one } from '../_decisions/load';
import { chooseAction } from './actions';

export const metadata: Metadata = { title: decisionsCopy.choose.metaTitle };

const copy = decisionsCopy.choose;
type Query = Record<string, string | string[] | undefined>;

/**
 * The second decision, part one: who is offered the home (UX-DC-7 to UX-DC-9; R17). A card per
 * applicant, in shortlist order, holding only what applications collect. Then a backup, with
 * "No backup" as an equal choice, then "Check and confirm". Pressing "Start the checks" is the
 * person's `choose_applicants` decision (`chooseApplicants`, ADR-0007); Gaff then asks the two
 * people chosen, and nobody else, for their checks (R18). It can change until an offer is made.
 */
export default async function ChoosePage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<Query>;
}) {
  const { member, letting, lettingHref } = await loadDecision(params);
  const query = await searchParams;
  const step = one(query.step);
  const here = decisionHref(letting.id, 'choose');
  const leave = { kind: 'close' as const, href: lettingHref };
  const listing = await applicantsFor(member, letting.id);
  const rows = listing?.rows ?? [];
  const nameOf = (id: string | undefined) => rows.find((r) => r.id === id)?.name ?? '';
  const done = (
    <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
      {decisionsCopy.done}
    </ButtonLink>
  );

  if (step === 'started') {
    const first = firstNameOf(nameOf(one(query.preferred)));
    const backup = one(query.backup) ? firstNameOf(nameOf(one(query.backup))) || null : null;
    return (
      <FlowShell leave={leave} primary={done}>
        <Outcome tone="success" title={copy.started.title} headingLevel={1} role="status">
          <p>{copy.started.text(first, backup)}</p>
          <p>{copy.started.next}</p>
        </Outcome>
      </FlowShell>
    );
  }

  if (listing?.offerMade) {
    return (
      <FlowShell leave={leave} primary={done}>
        <Outcome tone="info" title={copy.locked.title} headingLevel={1}>
          <p>{copy.locked.text}</p>
        </Outcome>
      </FlowShell>
    );
  }

  const choosable = rows.filter((r) => ['applied', 'preferred', 'backup'].includes(r.status));
  if (choosable.length === 0 || letting.status !== 'live') {
    return (
      <FlowShell leave={leave} primary={done}>
        <Outcome tone="info" title={copy.empty.title} headingLevel={1}>
          <p>{copy.empty.text}</p>
          {listing && listing.waitingToApply.length > 0 ? (
            <p>{copy.waitingToApply(listing.waitingToApply)}</p>
          ) : null}
        </Outcome>
      </FlowShell>
    );
  }

  const ids = new Set(choosable.map((r) => r.id));
  const current = {
    preferred: choosable.find((r) => r.status === 'preferred')?.id,
    backup: choosable.find((r) => r.status === 'backup')?.id,
  };
  const askedPreferred = one(query.preferred);
  const preferred = askedPreferred && ids.has(askedPreferred) ? askedPreferred : undefined;
  const askedBackup = one(query.backup);
  const backup =
    askedBackup === 'none' || (askedBackup && ids.has(askedBackup) && askedBackup !== preferred)
      ? askedBackup
      : undefined;
  const others = choosable.filter((r) => r.id !== preferred);
  const progress = (at: number) => ({ label: copy.progress, segments: copy.steps, current: at });
  const link = (extra: Record<string, string | undefined>) =>
    decisionHref(letting.id, 'choose', { preferred, backup, ...extra });
  const incomeLine = (row: (typeof rows)[number]) =>
    copy.incomeWords(formatEuro(row.monthlyIncomeCents), row.ratioTenths);

  // Step 3: check and confirm. Nothing has gone yet.
  if (step === 'check' && preferred && (backup || others.length === 0)) {
    const first = firstNameOf(nameOf(preferred));
    const second = backup && backup !== 'none' ? firstNameOf(nameOf(backup)) : null;
    const change = (href: string, what: string) => (
      <Link href={href}>
        {decisionsCopy.change}
        <span className="visually-hidden"> {what}</span>
      </Link>
    );
    return (
      <FlowShell
        leave={{ kind: 'back', href: link({ step: 'backup' }), label: decisionsCopy.back }}
        progress={progress(2)}
        form={{ action: chooseAction.bind(null, letting.id) }}
        back={
          <ButtonLink
            href={others.length > 0 ? link({ step: 'backup' }) : link({})}
            variant="quiet"
          >
            {decisionsCopy.back}
          </ButtonLink>
        }
        primary={
          <SubmitButton fullWidth="phone" pendingLabel={copy.check.starting}>
            {copy.check.start}
          </SubmitButton>
        }
      >
        <FlowTitle title={copy.check.title} lead={copy.check.text(first, second)} />
        <input type="hidden" name="preferredId" value={preferred} />
        <input type="hidden" name="backupId" value={backup && backup !== 'none' ? backup : ''} />
        <SummaryList
          rows={[
            {
              label: copy.check.preferred,
              value: nameOf(preferred),
              action: change(link({}), copy.check.preferred),
            },
            {
              label: copy.check.backup,
              value: second ? nameOf(backup) : copy.backup.none,
              action:
                others.length > 0 ? change(link({ step: 'backup' }), copy.check.backup) : undefined,
            },
          ]}
        />
        {one(query.problem) ? (
          <FieldError id="choose-problem">{one(query.problem)}</FieldError>
        ) : null}
      </FlowShell>
    );
  }

  // Step 2: a backup, or none, as an equal choice.
  if ((step === 'backup' || step === 'check') && preferred && others.length > 0) {
    const first = firstNameOf(nameOf(preferred));
    return (
      <FlowShell
        leave={{ kind: 'back', href: link({}), label: decisionsCopy.back }}
        progress={progress(1)}
        form={{ method: 'get', action: here }}
        back={
          <ButtonLink href={link({})} variant="quiet">
            {decisionsCopy.back}
          </ButtonLink>
        }
        primary={
          <SubmitButton fullWidth="phone" name="step" value="check">
            {decisionsCopy.next}
          </SubmitButton>
        }
      >
        <FlowTitle title={copy.backup.title} lead={copy.backup.lead(first)} />
        <input type="hidden" name="preferred" value={preferred} />
        <ChoiceGroup
          name="backup"
          legend={copy.backup.legend}
          hideLegend
          error={step === 'check' && !backup ? copy.backup.error : undefined}
          defaultValue={backup ?? (current.preferred === preferred ? current.backup : undefined)}
          options={[
            ...others.map((row) => ({
              value: row.id,
              label: row.name,
              hint: `${meetsWords(row)} · ${incomeLine(row)}`,
            })),
            { value: 'none', label: copy.backup.none, hint: copy.backup.noneHint },
          ]}
        />
      </FlowShell>
    );
  }

  // Step 1: a card per applicant, in shortlist order (UX-DC-7). Nobody is hidden, greyed out or
  // moved down for being below the income rule: it is said on their card (UX-DC-8).
  const chosen = preferred ?? current.preferred;
  const missing = (step === 'backup' || step === 'check') && !preferred;
  return (
    <FlowShell
      leave={leave}
      progress={progress(0)}
      form={{ method: 'get', action: here }}
      primary={
        <SubmitButton fullWidth="phone" name="step" value="backup">
          {decisionsCopy.next}
        </SubmitButton>
      }
    >
      <FlowTitle title={copy.title} lead={copy.lead(choosable.length)} />
      {backup ? <input type="hidden" name="backup" value={backup} /> : null}
      <PersonCards
        name="preferred"
        legend={copy.legend}
        hideLegend
        error={missing ? copy.noneChosen : undefined}
      >
        {choosable.map((row) => (
          <PersonCard
            key={row.id}
            name="preferred"
            value={row.id}
            person={row.name}
            chooseLabel={copy.choose}
            defaultChecked={row.id === chosen}
            status={
              row.status === 'preferred' ? (
                <StatusPill tone="success">{copy.nowPreferred}</StatusPill>
              ) : row.status === 'backup' ? (
                <StatusPill tone="info">{copy.nowBackup}</StatusPill>
              ) : null
            }
            facts={[
              // UX-DC-7: never "Didn't answer the questions" where no criterion was set.
              ...(row.total > 0 ? [{ label: copy.criteria, value: meetsWords(row) }] : []),
              {
                label: copy.income,
                value: (
                  <>
                    {incomeLine(row)}{' '}
                    <StatusPill tone={row.meetsRule ? 'success' : 'warning'}>
                      {row.meetsRule ? copy.meetsRule : copy.belowRule(listing!.incomeRuleTenths)}
                    </StatusPill>
                  </>
                ),
              },
              {
                label: copy.earns,
                value: row.earning ? earningLabels[row.earning] : copy.notGiven,
              },
              ...(row.appliedAt
                ? [{ label: copy.applied, value: formatDateTime(row.appliedAt) }]
                : []),
            ]}
          />
        ))}
      </PersonCards>
      {listing!.waitingToApply.length > 0 ? (
        <p>{copy.waitingToApply(listing!.waitingToApply)}</p>
      ) : null}
    </FlowShell>
  );
}
