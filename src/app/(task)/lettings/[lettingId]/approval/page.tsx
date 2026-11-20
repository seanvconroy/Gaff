import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { decisionsCopy, meetsWords } from '@/copy/decisions';
import { firstNameOf } from '@/domain/accounts/first-run';
import { incomeAgainstRule } from '@/domain/applications/apply';
import { checkLine, inCheckOrder, type CheckView } from '@/domain/checks/review';
import { decisionHref } from '@/domain/lettings/links';
import { checksStillUnderWay } from '@/domain/offers/approval';
import { applicantsFor } from '@/server/applications/choose';
import { approvalFor } from '@/server/offers/approval';
import { ButtonLink } from '@/ui/Button';
import { FieldError } from '@/ui/Field';
import { FlowShell, FlowTitle } from '@/ui/FlowShell';
import { Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import { Outcome } from '@/ui/Outcome';
import { SubmitButton } from '@/ui/SubmitButton';
import { SummaryList } from '@/ui/SummaryList';
import { loadDecision, one } from '../_decisions/load';
import { askOwnerAction, ownerDetailsAction, remindOwnerAction } from './actions';
import { OwnerDetails } from './OwnerDetails';

export const metadata: Metadata = { title: decisionsCopy.owner.metaTitle };

const copy = decisionsCopy.owner;

/**
 * The owner's approval, for an agency (UX-DC-14 to UX-DC-16; R19, Q22). "Who owns this home?"
 * only if Gaff doesn't know; then "Ask Mary to approve": what Mary will see, and "Send to Mary".
 * A quiet "Mary has already approved" records the operator's confirmation, as of today, to go
 * with the offer. While Gaff waits: "Waiting for Mary · sent 2 hours ago", with "Remind Mary".
 * A landlord letting their own home has nobody to ask: the offer is their approval.
 */
export default async function ApprovalPage({
  params,
  searchParams,
}: {
  params: Promise<{ lettingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { member, letting, lettingHref } = await loadDecision(params);
  const query = await searchParams;
  const leave = { kind: 'close' as const, href: lettingHref };
  const offerHref = decisionHref(letting.id, 'offer');
  const state = await approvalFor(member, letting.id);
  if (state?.route === 'own_home') redirect(offerHref);
  const listing = await applicantsFor(member, letting.id);
  const rows = listing?.rows ?? [];
  const preferred = rows.find((r) => r.id === state?.preferredId);
  const backup = rows.find((r) => r.id === state?.backupId);
  const done = (
    <ButtonLink href={lettingHref} variant="primary" fullWidth="phone">
      {decisionsCopy.done}
    </ButtonLink>
  );
  const toOffer = (
    <ButtonLink href={offerHref} variant="primary" fullWidth="phone">
      {copy.confirmed.continue}
    </ButtonLink>
  );
  if (!state || !preferred || !listing) {
    return (
      <FlowShell
        leave={leave}
        primary={
          <ButtonLink href={decisionHref(letting.id, 'choose')} variant="primary" fullWidth="phone">
            {decisionsCopy.offer.nobody.action}
          </ButtonLink>
        }
      >
        <Outcome tone="info" title={decisionsCopy.offer.nobody.title} headingLevel={1}>
          <p>{decisionsCopy.offer.nobody.text}</p>
        </Outcome>
      </FlowShell>
    );
  }

  const owner = state.landlord ? firstNameOf(state.landlord.name) || copy.theOwner : copy.theOwner;
  const first = firstNameOf(preferred.name);
  const second = backup ? firstNameOf(backup.name) : null;
  const finished = one(query.done);
  const problem = one(query.problem);

  if (finished === 'sent') {
    return (
      <FlowShell leave={leave} primary={done}>
        <Outcome tone="success" title={copy.sent.title(owner)} headingLevel={1} role="status">
          <p>{copy.sent.text(owner)}</p>
          <p>{copy.sent.next(owner)}</p>
        </Outcome>
      </FlowShell>
    );
  }

  const approval = state.approval;
  if (approval?.status === 'answered') {
    if (approval.preferredAnswer !== 'approved') {
      return (
        <FlowShell
          leave={leave}
          primary={
            <ButtonLink
              href={decisionHref(letting.id, 'choose')}
              variant="primary"
              fullWidth="phone"
            >
              {copy.answered.chooseAgain}
            </ButtonLink>
          }
        >
          <Outcome tone="warning" title={copy.answered.declined(owner, first)} headingLevel={1}>
            <p>{copy.answered.declinedText}</p>
          </Outcome>
        </FlowShell>
      );
    }
    const confirmed = finished === 'confirmed' && approval.confirmedBy;
    return (
      <FlowShell leave={leave} primary={toOffer}>
        <Outcome
          tone="success"
          title={
            confirmed
              ? copy.confirmed.title(owner)
              : second && approval.backupAnswer !== 'approved'
                ? copy.answered.approvedNoBackup(owner, first, second)
                : copy.answered.approved(owner, first, second)
          }
          headingLevel={1}
          role={confirmed ? 'status' : undefined}
        >
          {confirmed ? <p>{copy.confirmed.text(approval.answeredAt ?? new Date())}</p> : null}
        </Outcome>
      </FlowShell>
    );
  }

  const ask = askOwnerAction.bind(null, letting.id);
  const already = (
    <div>
      <SubmitButton variant="quiet" fullWidth="phone" name="intent" value="confirm">
        {copy.ask.already(owner)}
      </SubmitButton>
    </div>
  );

  // UX-DC-16: while Gaff waits for the owner.
  if (approval?.status === 'requested') {
    return (
      <FlowShell leave={leave} primary={done}>
        <FlowTitle
          title={copy.waiting.title(owner)}
          lead={copy.waiting.line(owner, approval.remindedAt ?? approval.requestedAt)}
        />
        <p>{copy.waiting.text(owner)}</p>
        {one(query.reminded) ? <p role="status">{copy.waiting.reminded(owner)}</p> : null}
        <form action={remindOwnerAction.bind(null, letting.id)}>
          <SubmitButton variant="secondary" fullWidth="phone" pendingLabel={copy.waiting.reminding}>
            {copy.waiting.remind(owner)}
          </SubmitButton>
        </form>
        <form action={ask}>{already}</form>
        {problem ? <FieldError id="owner-problem">{problem}</FieldError> : null}
      </FlowShell>
    );
  }

  // UX-DC-14: the owner's details, asked here if Gaff doesn't have them, and nowhere earlier.
  if (!state.landlord) {
    return (
      <OwnerDetails action={ownerDetailsAction.bind(null, letting.id)} lettingHref={lettingHref} />
    );
  }

  const rule = { rentCents: listing.rentCents, ruleTenths: listing.incomeRuleTenths };
  const underWay = checksStillUnderWay([...preferred.checks, ...(backup?.checks ?? [])]);
  // What the owner will see, as their page shows it: income against the rule, never the amount.
  const sees = (row: typeof preferred, role: string) => {
    const income = incomeAgainstRule(row.monthlyIncomeCents, rule.rentCents, rule.ruleTenths);
    return (
      <section aria-labelledby={`sees-${row.id}`}>
        <Stack gap={3}>
          <h3 id={`sees-${row.id}`} className="type-heading">
            {row.name}, {role}
          </h3>
          <SummaryList
            rows={[
              ...(row.total > 0
                ? [{ label: decisionsCopy.choose.criteria, value: meetsWords(row) }]
                : []),
              {
                label: copy.ask.incomeLabel,
                value: copy.ask.income(income.ratioTenths, income.meetsRule),
              },
              ...inCheckOrder(row.checks as CheckView[]).map((check) => {
                const back = check.status !== 'to_do' && check.status !== 'in_progress';
                const line = checkLine(check);
                const value = !back ? copy.ask.stillUnderWay : line.text;
                return { label: line.label, value };
              }),
            ]}
          />
        </Stack>
      </section>
    );
  };
  return (
    <FlowShell
      leave={leave}
      form={{ action: ask }}
      primary={
        <SubmitButton fullWidth="phone" name="intent" value="send" pendingLabel={copy.ask.sending}>
          {copy.ask.send(owner)}
        </SubmitButton>
      }
    >
      <FlowTitle title={copy.ask.title(owner)} lead={copy.ask.lead(owner)} />
      {/* UX-OP-7: warned before asking while checks are unfinished. */}
      {underWay > 0 ? (
        <Notice tone="warning">
          <p>{copy.ask.underWay(underWay, owner)}</p>
        </Notice>
      ) : null}
      <h2 className="type-title">{copy.ask.sees(owner)}</h2>
      {sees(preferred, copy.ask.preferred.toLowerCase())}
      {backup ? sees(backup, copy.ask.backup.toLowerCase()) : null}
      {problem ? <FieldError id="owner-problem">{problem}</FieldError> : null}
      {already}
    </FlowShell>
  );
}
